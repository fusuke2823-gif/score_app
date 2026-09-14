const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/index');
const { authenticateToken } = require('../middleware/auth');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post('/register', async (req, res) => {
  const { user_code, password, ref } = req.body;

  if (!user_code || !password)
    return res.status(400).json({ error: 'ログインIDとパスワードは必須です' });
  if (!/^[A-Za-z0-9_]{4,20}$/.test(user_code))
    return res.status(400).json({ error: 'ログインIDは英数字・アンダースコアで4〜20文字で入力してください' });
  if (password.length < 6)
    return res.status(400).json({ error: 'パスワードは6文字以上で入力してください' });

  const isInternal = !!(process.env.INTERNAL_REF_CODE && ref && ref === process.env.INTERNAL_REF_CODE);

  try {
    const existing = await pool.query('SELECT id FROM users WHERE user_code = $1 OR username = $1', [user_code]);
    if (existing.rows.length > 0)
      return res.status(409).json({ error: 'このIDは既に使用されています' });
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, user_code) VALUES ($1, $2, $3) RETURNING id, username, role, oshi_character, user_code',
      [user_code, hash, user_code]
    );
    const user = result.rows[0];
    await pool.query('UPDATE users SET points = 300 WHERE id = $1', [user.id]);
    await pool.query('INSERT INTO point_history (user_id, amount, reason) VALUES ($1, 300, $2)', [user.id, '新規登録ボーナス']);
    if (isInternal) {
      await pool.query('UPDATE users SET is_internal = TRUE WHERE id = $1', [user.id]);
    }
    user.is_internal = isInternal;
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, is_internal: isInternal },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ needs_username: true, token, user });
  } catch (err) {
    console.error('[register error]', err.code, err.message);
    if (err.code === '23505')
      return res.status(409).json({ error: 'このIDは既に使用されています' });
    res.status(500).json({ error: `サーバーエラー: ${err.message}` });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1 OR user_code = $1', [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'ユーザー名またはパスワードが間違っています' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, is_internal: user.is_internal },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, oshi_character: user.oshi_character, is_internal: user.is_internal, user_code: user.user_code }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, role, oshi_character, is_internal, created_at, user_code, (google_id IS NOT NULL) AS has_google FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.put('/me', authenticateToken, async (req, res) => {
  const { username, user_code, oshi_character, current_password, new_password, twitter_username, youtube_channel } = req.body;

  if (username !== undefined) {
    if (username.length < 1 || username.length > 12)
      return res.status(400).json({ error: 'ユーザー名は1〜12文字で入力してください' });
  }
  if (user_code !== undefined && user_code !== null && user_code !== '') {
    if (!/^[A-Za-z0-9_]{4,20}$/.test(user_code))
      return res.status(400).json({ error: 'ログインIDは英数字・アンダースコアで4〜20文字で入力してください' });
  }
  if (twitter_username !== undefined && twitter_username !== null && twitter_username !== '') {
    if (!/^[A-Za-z0-9_]{1,15}$/.test(twitter_username))
      return res.status(400).json({ error: 'XユーザーIDは英数字・アンダースコア1〜15文字で入力してください' });
  }
  if (youtube_channel !== undefined && youtube_channel !== null && youtube_channel !== '') {
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(youtube_channel))
      return res.status(400).json({ error: 'YouTubeハンドルは英数字・アンダースコア・ハイフン・ドット3〜30文字で入力してください' });
  }

  try {
    if (username) {
      const existing = await pool.query('SELECT 1 FROM users WHERE username = $1 AND id != $2', [username, req.user.id]);
      if (existing.rows.length > 0)
        return res.status(409).json({ error: 'このユーザー名は既に使用されています' });
    }
    if (user_code) {
      const existing = await pool.query('SELECT 1 FROM users WHERE user_code = $1 AND id != $2', [user_code, req.user.id]);
      if (existing.rows.length > 0)
        return res.status(409).json({ error: 'このログインIDは既に使用されています' });
    }
    if (new_password) {
      if (new_password.length < 6)
        return res.status(400).json({ error: '新しいパスワードは6文字以上で入力してください' });
      if (!current_password)
        return res.status(400).json({ error: '現在のパスワードを入力してください' });
      const userRow = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      const ok = await bcrypt.compare(current_password, userRow.rows[0].password_hash);
      if (!ok) return res.status(401).json({ error: '現在のパスワードが間違っています' });
    }

    const twName = twitter_username === '' ? null : (twitter_username ?? null);
    const ytCh = youtube_channel === '' ? null : (youtube_channel ?? null);
    const newCode = user_code || null;
    let result;
    if (new_password) {
      const hash = await bcrypt.hash(new_password, 10);
      result = await pool.query(
        'UPDATE users SET username=COALESCE($1,username), user_code=COALESCE($2,user_code), oshi_character=$3, password_hash=$4, twitter_username=$5, youtube_channel=$6 WHERE id=$7 RETURNING id, username, role, oshi_character, user_code',
        [username || null, newCode, oshi_character ?? null, hash, twName, ytCh, req.user.id]
      );
    } else {
      result = await pool.query(
        'UPDATE users SET username=COALESCE($1,username), user_code=COALESCE($2,user_code), oshi_character=$3, twitter_username=$4, youtube_channel=$5 WHERE id=$6 RETURNING id, username, role, oshi_character, user_code',
        [username || null, newCode, oshi_character ?? null, twName, ytCh, req.user.id]
      );
    }

    const updated = result.rows[0];
    const token = require('jsonwebtoken').sign(
      { id: updated.id, username: updated.username, role: updated.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ user: updated, token });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'このIDは既に使用されています' });
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// アカウント削除（自分自身）
router.delete('/me', authenticateToken, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'パスワードを入力してください' });
  try {
    const userRow = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!userRow.rows[0]) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    const ok = await bcrypt.compare(password, userRow.rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'パスワードが間違っています' });
    await pool.query('DELETE FROM users WHERE id=$1', [req.user.id]);
    res.json({ message: 'アカウントを削除しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// Google認証トークン検証
router.post('/google/verify', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'トークンがありません' });
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const googleId = payload.sub;

    // 既存ユーザーか確認
    const existing = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role, is_internal: user.is_internal },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.json({ token, user: { id: user.id, username: user.username, role: user.role, oshi_character: user.oshi_character, is_internal: user.is_internal } });
    }

    // 新規 → ユーザー名設定が必要
    res.json({ needs_username: true, google_id: googleId });
  } catch (err) {
    console.error('[google verify error]', err.message);
    res.status(401).json({ error: 'Google認証に失敗しました' });
  }
});

// 既存アカウントにGoogle連携
router.post('/google/link', authenticateToken, async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'トークンがありません' });
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const googleId = ticket.getPayload().sub;
    const existing = await pool.query('SELECT id FROM users WHERE google_id = $1 AND id != $2', [googleId, req.user.id]);
    if (existing.rows.length > 0)
      return res.status(409).json({ error: 'このGoogleアカウントは別のユーザーに連携されています' });
    await pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, req.user.id]);
    res.json({ message: 'Googleアカウントを連携しました' });
  } catch (err) {
    console.error('[google link error]', err.message);
    res.status(401).json({ error: 'Google認証に失敗しました' });
  }
});

// Google新規登録（ユーザー名確定）
router.post('/google/register', async (req, res) => {
  const { google_id, username, oshi_character, ref, twitter_username, youtube_channel } = req.body;
  if (!google_id || !username) return res.status(400).json({ error: 'ユーザー名を入力してください' });
  if (username.length < 1 || username.length > 12)
    return res.status(400).json({ error: 'ユーザー名は1〜12文字で入力してください' });
  if (twitter_username && !/^[A-Za-z0-9_]{1,15}$/.test(twitter_username))
    return res.status(400).json({ error: 'X IDは英数字・アンダースコアのみ15文字以内で入力してください' });
  if (youtube_channel && !/^[A-Za-z0-9._-]{3,30}$/.test(youtube_channel))
    return res.status(400).json({ error: 'YouTubeハンドルは英数字・ピリオド・ハイフン・アンダースコアのみ3〜30文字で入力してください' });

  const isInternal = !!(process.env.INTERNAL_REF_CODE && ref && ref === process.env.INTERNAL_REF_CODE);

  try {
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0)
      return res.status(409).json({ error: 'このユーザー名は既に使用されています' });

    const result = await pool.query(
      'INSERT INTO users (username, password_hash, oshi_character, google_id, twitter_username, youtube_channel) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, role, oshi_character, user_code',
      [username, '', oshi_character || null, google_id, twitter_username || null, youtube_channel || null]
    );
    const user = result.rows[0];
    await pool.query('UPDATE users SET points = 300 WHERE id = $1', [user.id]);
    await pool.query('INSERT INTO point_history (user_id, amount, reason) VALUES ($1, 300, $2)', [user.id, '新規登録ボーナス']);
    if (isInternal) {
      await pool.query('UPDATE users SET is_internal = TRUE WHERE id = $1', [user.id]);
    }
    user.is_internal = isInternal;
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, is_internal: isInternal },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user });
  } catch (err) {
    console.error('[google register error]', err.code, err.message);
    if (err.code === '23505')
      return res.status(409).json({ error: 'このユーザー名は既に使用されています' });
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ===== ログインボーナス「討伐チャレンジ」 =====
const WEAPON_ATTRS = ['斬', '突', '打'];
const ELEMENT_ATTRS = ['火', '氷', '雷', '光', '闇']; // 無は別扱い

function lbShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateBossEnemyChart(isDay7) {
  const weaponSlots = isDay7 ? ['weak', 'neutral', 'neutral'] : ['weak', 'neutral', 'resist'];
  lbShuffle(weaponSlots);
  const weaponMap = {};
  WEAPON_ATTRS.forEach((w, i) => { weaponMap[w] = weaponSlots[i]; });

  const elementSlots = isDay7
    ? ['weak', 'weak', 'neutral', 'neutral', 'neutral']
    : ['weak', 'weak', 'neutral', 'resist', 'resist'];
  lbShuffle(elementSlots);
  const elementMap = {};
  ELEMENT_ATTRS.forEach((e, i) => { elementMap[e] = elementSlots[i]; });

  return { weaponMap, elementMap };
}

function lbScoreOf(status) { return status === 'weak' ? 1 : status === 'resist' ? -1 : 0; }

async function getLoginBonusScoreTable() {
  const result = await pool.query("SELECT key, value FROM settings WHERE key LIKE 'login_bonus_score_%'");
  const table = { '-2': 10, '-1': 15, '0': 25, '1': 40, '2': 100 };
  const keyMap = { m2: '-2', m1: '-1', '0': '0', p1: '1', p2: '2' };
  result.rows.forEach(r => {
    const suffix = r.key.replace('login_bonus_score_', '');
    if (suffix in keyMap) table[keyMap[suffix]] = parseInt(r.value) || 0;
  });
  return table;
}

const BOSS_MAX_HP = 40;

function damageForTotal(total) {
  return { '-2': 0, '-1': 1, '0': 2, '1': 3, '2': 5 }[String(total)] ?? 0;
}

// ID昇順で「currentIdより大きい最小のID」を返す。無ければ先頭（最小ID）に周回。プールが空ならnull。
async function pickNextEnemyId(currentId) {
  if (currentId != null) {
    const next = await pool.query('SELECT id FROM login_bonus_enemies WHERE id > $1 ORDER BY id ASC LIMIT 1', [currentId]);
    if (next.rows.length > 0) return next.rows[0].id;
  }
  const first = await pool.query('SELECT id FROM login_bonus_enemies ORDER BY id ASC LIMIT 1');
  return first.rows.length > 0 ? first.rows[0].id : null;
}

// ユーザーの現在の討伐対象を取得。未割り当てなら先頭（最小ID）から開始（HP全快）。
// 割り当て済みの敵がadminによって削除済みだった場合は割り当てをクリアして再割り当て。
async function ensureBossEnemy(userId) {
  const u = await pool.query('SELECT current_boss_enemy_id, current_boss_hp FROM users WHERE id=$1', [userId]);
  let { current_boss_enemy_id, current_boss_hp } = u.rows[0];

  if (!current_boss_enemy_id) {
    const firstId = await pickNextEnemyId(null);
    if (firstId === null) return null; // adminが敵を1体も登録していない
    current_boss_enemy_id = firstId;
    current_boss_hp = BOSS_MAX_HP;
    await pool.query(
      'UPDATE users SET current_boss_enemy_id=$1, current_boss_hp=$2 WHERE id=$3',
      [current_boss_enemy_id, current_boss_hp, userId]
    );
  }

  const info = await pool.query('SELECT name, image_url FROM login_bonus_enemies WHERE id=$1', [current_boss_enemy_id]);
  if (info.rows.length === 0) {
    // 割り当て後にadminが削除していた場合：クリアして1回だけ再試行
    await pool.query('UPDATE users SET current_boss_enemy_id=NULL, current_boss_hp=NULL WHERE id=$1', [userId]);
    return ensureBossEnemy(userId);
  }
  return { id: current_boss_enemy_id, name: info.rows[0].name, image_url: info.rows[0].image_url, hp: current_boss_hp };
}

// 討伐称号を名前で検索し、無ければ作成してIDを返す
async function getOrCreateDefeatTitle(enemyName) {
  const name = `${enemyName}討伐`;
  const existing = await pool.query('SELECT id FROM titles WHERE name=$1', [name]);
  if (existing.rows.length > 0) return existing.rows[0].id;
  const created = await pool.query(
    'INSERT INTO titles (name, description, is_active) VALUES ($1,$2,TRUE) RETURNING id',
    [name, `討伐チャレンジで「${enemyName}」を討伐した証`]
  );
  return created.rows[0].id;
}

// 日付の切り替わりを朝4時(JST)にするための補正。
// JST=UTC+9なので、朝4時=UTC 19時（前日）。UTC時刻に+5時間してから
// 日付を切り出すと、UTC 19時（=JST 4時）に日付が繰り上がる。
const LB_DAY_RESET_OFFSET_HOURS = 5;
function lbTodayStr() {
  return new Date(Date.now() + LB_DAY_RESET_OFFSET_HOURS * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function lbYesterdayStr() {
  const d = new Date(Date.now() + LB_DAY_RESET_OFFSET_HOURS * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// 討伐チャレンジ状態確認
router.get('/login-bonus', authenticateToken, async (req, res) => {
  try {
    const [userResult, scoreTable, bossEnemy] = await Promise.all([
      pool.query('SELECT last_login_date, login_streak FROM users WHERE id=$1', [req.user.id]),
      getLoginBonusScoreTable(),
      ensureBossEnemy(req.user.id),
    ]);
    const { last_login_date, login_streak } = userResult.rows[0];
    const today = lbTodayStr();
    const lastDate = last_login_date ? last_login_date.toISOString().slice(0, 10) : null;
    const alreadyClaimed = lastDate === today;

    let nextStreak;
    if (alreadyClaimed) {
      nextStreak = login_streak || 0;
    } else {
      nextStreak = lastDate === lbYesterdayStr() ? (login_streak % 7) + 1 : 1;
    }

    res.json({
      already_claimed: alreadyClaimed,
      streak: login_streak || 0,
      next_streak: nextStreak,
      is_day7: nextStreak === 7,
      score_table: scoreTable,
      boss_enemy: bossEnemy
        ? { name: bossEnemy.name, image_url: bossEnemy.image_url, hp: bossEnemy.hp, max_hp: BOSS_MAX_HP }
        : { name: '謎の魔物', image_url: null, hp: null, max_hp: BOSS_MAX_HP },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 討伐チャレンジ挑戦
router.post('/login-bonus', authenticateToken, async (req, res) => {
  const { weapon, element } = req.body;
  if (!WEAPON_ATTRS.includes(weapon))
    return res.status(400).json({ error: '無効な武器属性です' });
  if (![...ELEMENT_ATTRS, '無'].includes(element))
    return res.status(400).json({ error: '無効な元素属性です' });

  try {
    const [userResult, scoreTable] = await Promise.all([
      pool.query('SELECT last_login_date, login_streak FROM users WHERE id=$1', [req.user.id]),
      getLoginBonusScoreTable(),
    ]);
    const { last_login_date, login_streak } = userResult.rows[0];
    const today = lbTodayStr();
    const lastDate = last_login_date ? last_login_date.toISOString().slice(0, 10) : null;

    if (lastDate === today) return res.status(409).json({ error: '本日分はすでに受け取り済みです' });

    const newStreak = lastDate === lbYesterdayStr() ? (login_streak % 7) + 1 : 1;
    const isDay7 = newStreak === 7;

    const enemy = generateBossEnemyChart(isDay7);
    const wStatus = enemy.weaponMap[weapon];
    let eStatus, forced = false, total;
    if (element === '無') {
      forced = true;
      eStatus = 'void';
      total = 0;
    } else {
      eStatus = enemy.elementMap[element];
      total = lbScoreOf(wStatus) + lbScoreOf(eStatus);
    }
    const points = scoreTable[String(total)] ?? scoreTable['0'];

    await pool.query(
      'UPDATE users SET last_login_date=$1, login_streak=$2, points=points+$3, total_login_days=total_login_days+1 WHERE id=$4',
      [today, newStreak, points, req.user.id]
    );
    await pool.query(
      'INSERT INTO point_history (user_id, amount, reason) VALUES ($1,$2,$3)',
      [req.user.id, points, `討伐チャレンジ ${newStreak}日目`]
    );

    // 敵HP・ダメージ・討伐称号
    const boss = await ensureBossEnemy(req.user.id);
    const damage = damageForTotal(total);
    let bossHpBefore = boss ? boss.hp : null;
    let bossHpAfter = bossHpBefore;
    let bossDefeated = false;
    let awardedTitle = null;

    if (boss && damage > 0) {
      bossHpAfter = Math.max(0, bossHpBefore - damage);
      await pool.query('UPDATE users SET current_boss_hp=$1 WHERE id=$2', [bossHpAfter, req.user.id]);
      if (bossHpAfter === 0) {
        bossDefeated = true;
        const titleId = await getOrCreateDefeatTitle(boss.name);
        await pool.query(
          'INSERT INTO user_titles (user_id, title_id) VALUES ($1,$2) ON CONFLICT (user_id, title_id) DO NOTHING',
          [req.user.id, titleId]
        );
        awardedTitle = `${boss.name}討伐`;
        const nextId = await pickNextEnemyId(boss.id);
        await pool.query(
          'UPDATE users SET current_boss_enemy_id=$1, current_boss_hp=$2 WHERE id=$3',
          [nextId, nextId !== null ? BOSS_MAX_HP : null, req.user.id]
        );
      }
    }

    res.json({
      streak: newStreak,
      is_day7: isDay7,
      points_earned: points,
      total,
      forced,
      picked_weapon: weapon,
      picked_element: element,
      weapon_map: enemy.weaponMap,
      element_map: { ...enemy.elementMap, 無: 'void' },
      boss_enemy: boss ? { name: boss.name, image_url: boss.image_url } : { name: '謎の魔物', image_url: null },
      boss_hp_before: bossHpBefore,
      boss_hp_after: bossHpAfter,
      boss_max_hp: BOSS_MAX_HP,
      boss_defeated: bossDefeated,
      awarded_title: awardedTitle,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 特別ログインボーナス一覧（有効期間中のもの + ユーザーの受取状況）
router.get('/special-bonuses', authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await pool.query(
      `SELECT b.id, b.title, b.start_date, b.end_date, b.max_claims, b.points_per_claim,
              COALESCE(c.claimed_count, 0) AS claimed_count,
              c.last_claimed_date
       FROM special_login_bonuses b
       LEFT JOIN special_login_bonus_claims c ON c.bonus_id = b.id AND c.user_id = $1
       WHERE b.is_active = TRUE AND b.start_date <= $2 AND b.end_date >= $2
       ORDER BY b.created_at DESC`,
      [req.user.id, today]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 特別ログインボーナス受け取り
router.post('/special-bonuses/:id/claim', authenticateToken, async (req, res) => {
  const bonusId = parseInt(req.params.id);
  try {
    const today = new Date().toISOString().slice(0, 10);
    const bonusRes = await pool.query(
      'SELECT * FROM special_login_bonuses WHERE id=$1 AND is_active=TRUE AND start_date<=$2 AND end_date>=$2',
      [bonusId, today]
    );
    if (bonusRes.rows.length === 0) return res.status(404).json({ error: 'ボーナスが見つかりません' });
    const bonus = bonusRes.rows[0];

    const claimRes = await pool.query(
      'SELECT * FROM special_login_bonus_claims WHERE user_id=$1 AND bonus_id=$2',
      [req.user.id, bonusId]
    );
    const claim = claimRes.rows[0];

    if (claim) {
      if (claim.claimed_count >= bonus.max_claims)
        return res.status(409).json({ error: '受取上限に達しています' });
      const lastDate = claim.last_claimed_date ? claim.last_claimed_date.toISOString().slice(0, 10) : null;
      if (lastDate === today)
        return res.status(409).json({ error: '本日分はすでに受け取り済みです' });
      await pool.query(
        'UPDATE special_login_bonus_claims SET claimed_count=claimed_count+1, last_claimed_date=$1 WHERE user_id=$2 AND bonus_id=$3',
        [today, req.user.id, bonusId]
      );
    } else {
      await pool.query(
        'INSERT INTO special_login_bonus_claims (user_id, bonus_id, claimed_count, last_claimed_date) VALUES ($1,$2,1,$3)',
        [req.user.id, bonusId, today]
      );
    }

    await pool.query('UPDATE users SET points=points+$1 WHERE id=$2', [bonus.points_per_claim, req.user.id]);
    await pool.query(
      'INSERT INTO point_history (user_id, amount, reason) VALUES ($1,$2,$3)',
      [req.user.id, bonus.points_per_claim, `特別ボーナス「${bonus.title}」`]
    );

    const newCount = (claim?.claimed_count || 0) + 1;
    res.json({ points_earned: bonus.points_per_claim, claimed_count: newCount, max_claims: bonus.max_claims });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
