const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/index');
const { authenticateToken } = require('../middleware/auth');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post('/register', async (req, res) => {
  const { username, password, oshi_character, ref } = req.body;

  if (!username || !password)
    return res.status(400).json({ error: 'ユーザー名とパスワードは必須です' });
  if (username.length < 1 || username.length > 12)
    return res.status(400).json({ error: 'ユーザー名は1〜12文字で入力してください' });
  if (password.length < 6)
    return res.status(400).json({ error: 'パスワードは6文字以上で入力してください' });

  // 内部登録: URLトークン(ref) が一致する場合のみ
  const isInternal = !!(process.env.INTERNAL_REF_CODE && ref && ref === process.env.INTERNAL_REF_CODE);

  try {
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0)
      return res.status(409).json({ error: 'このユーザー名は既に使用されています [dup]' });
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, oshi_character) VALUES ($1, $2, $3) RETURNING id, username, role, oshi_character',
      [username, hash, oshi_character || null]
    );
    const user = result.rows[0];
    await pool.query('UPDATE users SET points = 50 WHERE id = $1', [user.id]);
    await pool.query('INSERT INTO point_history (user_id, amount, reason) VALUES ($1, 50, $2)', [user.id, '新規登録ボーナス']);
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
    console.error('[register error]', err.code, err.message);
    if (err.code === '23505')
      return res.status(409).json({ error: 'このユーザー名は既に使用されています [unique]' });
    res.status(500).json({ error: `サーバーエラー: ${err.message}` });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
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
      user: { id: user.id, username: user.username, role: user.role, oshi_character: user.oshi_character, is_internal: user.is_internal }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, role, oshi_character, is_internal, created_at, (google_id IS NOT NULL) AS has_google FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.put('/me', authenticateToken, async (req, res) => {
  const { username, oshi_character, current_password, new_password } = req.body;

  if (username !== undefined) {
    if (username.length < 1 || username.length > 12)
      return res.status(400).json({ error: 'ユーザー名は1〜12文字で入力してください' });
  }

  try {
    if (username) {
      const existing = await pool.query('SELECT 1 FROM users WHERE username = $1 AND id != $2', [username, req.user.id]);
      if (existing.rows.length > 0)
        return res.status(409).json({ error: 'このユーザー名は既に使用されています' });
    }
    // パスワード変更がある場合は現在のパスワードを確認
    if (new_password) {
      if (new_password.length < 6)
        return res.status(400).json({ error: '新しいパスワードは6文字以上で入力してください' });
      if (!current_password)
        return res.status(400).json({ error: '現在のパスワードを入力してください' });
      const userRow = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      const ok = await bcrypt.compare(current_password, userRow.rows[0].password_hash);
      if (!ok) return res.status(401).json({ error: '現在のパスワードが間違っています' });
    }

    let result;
    if (new_password) {
      const hash = await bcrypt.hash(new_password, 10);
      result = await pool.query(
        'UPDATE users SET username=COALESCE($1,username), oshi_character=$2, password_hash=$3 WHERE id=$4 RETURNING id, username, role, oshi_character',
        [username || null, oshi_character ?? null, hash, req.user.id]
      );
    } else {
      result = await pool.query(
        'UPDATE users SET username=COALESCE($1,username), oshi_character=$2 WHERE id=$3 RETURNING id, username, role, oshi_character',
        [username || null, oshi_character ?? null, req.user.id]
      );
    }

    const updated = result.rows[0];
    // JWTのusernameも更新
    const token = require('jsonwebtoken').sign(
      { id: updated.id, username: updated.username, role: updated.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ user: updated, token });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'このユーザー名は既に使用されています' });
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
  const { google_id, username, oshi_character, ref } = req.body;
  if (!google_id || !username) return res.status(400).json({ error: 'ユーザー名を入力してください' });
  if (username.length < 1 || username.length > 12)
    return res.status(400).json({ error: 'ユーザー名は1〜12文字で入力してください' });

  const isInternal = !!(process.env.INTERNAL_REF_CODE && ref && ref === process.env.INTERNAL_REF_CODE);

  try {
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0)
      return res.status(409).json({ error: 'このユーザー名は既に使用されています' });

    const result = await pool.query(
      'INSERT INTO users (username, password_hash, oshi_character, google_id) VALUES ($1, $2, $3, $4) RETURNING id, username, role, oshi_character',
      [username, '', oshi_character || null, google_id]
    );
    const user = result.rows[0];
    await pool.query('UPDATE users SET points = 50 WHERE id = $1', [user.id]);
    await pool.query('INSERT INTO point_history (user_id, amount, reason) VALUES ($1, 50, $2)', [user.id, '新規登録ボーナス']);
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

// ログインボーナス状態確認
// ログインボーナス日別pt設定を取得するヘルパー
async function getLoginBonusPts() {
  const result = await pool.query(
    "SELECT key, value FROM settings WHERE key LIKE 'login_bonus_day%'"
  );
  const pts = [1,1,1,1,1,1,4];
  result.rows.forEach(r => {
    const day = parseInt(r.key.replace('login_bonus_day', ''));
    if (day >= 1 && day <= 7) pts[day - 1] = parseInt(r.value) || 0;
  });
  return pts;
}

router.get('/login-bonus', authenticateToken, async (req, res) => {
  try {
    const [userResult, pts] = await Promise.all([
      pool.query('SELECT last_login_date, login_streak FROM users WHERE id=$1', [req.user.id]),
      getLoginBonusPts()
    ]);
    const { last_login_date, login_streak } = userResult.rows[0];
    const today = new Date().toISOString().slice(0, 10);
    const lastDate = last_login_date ? last_login_date.toISOString().slice(0, 10) : null;
    res.json({ already_claimed: lastDate === today, streak: login_streak || 0, day_pts: pts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ログインボーナス受け取り
router.post('/login-bonus', authenticateToken, async (req, res) => {
  try {
    const [userResult, pts] = await Promise.all([
      pool.query('SELECT last_login_date, login_streak FROM users WHERE id=$1', [req.user.id]),
      getLoginBonusPts()
    ]);
    const { last_login_date, login_streak } = userResult.rows[0];
    const today = new Date().toISOString().slice(0, 10);
    const lastDate = last_login_date ? last_login_date.toISOString().slice(0, 10) : null;

    if (lastDate === today) return res.status(409).json({ error: '本日分はすでに受け取り済みです' });

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    let newStreak = lastDate === yesterdayStr ? (login_streak % 7) + 1 : 1;
    const points = pts[newStreak - 1] ?? 1;

    await pool.query(
      'UPDATE users SET last_login_date=$1, login_streak=$2, points=points+$3, total_login_days=total_login_days+1 WHERE id=$4',
      [today, newStreak, points, req.user.id]
    );
    await pool.query(
      'INSERT INTO point_history (user_id, amount, reason) VALUES ($1,$2,$3)',
      [req.user.id, points, `ログインボーナス ${newStreak}日目`]
    );
    res.json({ streak: newStreak, points_earned: points });
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
