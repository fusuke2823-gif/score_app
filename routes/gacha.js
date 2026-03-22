const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { authenticateToken } = require('../middleware/auth');

// ガチャ設定（公開）
router.get('/settings', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('gacha_ss_rate','gacha_s_rate','gacha_a_rate','gacha_single_cost','gacha_multi_cost','gacha_show_nav')"
    );
    const map = {};
    result.rows.forEach(r => { map[r.key] = r.value; });
    res.json({
      ss_rate: parseFloat(map.gacha_ss_rate || '3'),
      s_rate: parseFloat(map.gacha_s_rate || '15'),
      a_rate: parseFloat(map.gacha_a_rate || '82'),
      single_cost: parseInt(map.gacha_single_cost || '50'),
      multi_cost: parseInt(map.gacha_multi_cost || '450'),
      show_nav: map.gacha_show_nav === 'true'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// アクティブなガチャプール一覧（公開）
router.get('/pools', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT gp.id, gp.name, gp.description, gp.image_url, gp.order_index,
              COUNT(DISTINCT gpi.icon_id)::int AS icon_count,
              COALESCE(
                (SELECT json_agg(jsonb_build_object('id', gi.id, 'name', gi.name, 'image_url', gi.image_url) ORDER BY gi.id)
                 FROM gacha_pool_pickups gpp
                 JOIN gacha_icons gi ON gi.id = gpp.icon_id AND gi.is_active = TRUE
                 WHERE gpp.pool_id = gp.id),
                '[]'::json
              ) AS pickup_icons
       FROM gacha_pools gp
       LEFT JOIN gacha_pool_icons gpi ON gp.id = gpi.pool_id
       WHERE gp.is_active = TRUE
       GROUP BY gp.id
       ORDER BY gp.order_index ASC, gp.id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// プール内のアイコン一覧（公開）
router.get('/pools/:id/icons', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT gi.id, gi.name, gi.rarity, gi.image_url,
              (gpp.icon_id IS NOT NULL) AS is_pickup
       FROM gacha_icons gi
       JOIN gacha_pool_icons gpi ON gi.id = gpi.icon_id
       LEFT JOIN gacha_pool_pickups gpp ON gi.id = gpp.icon_id AND gpp.pool_id = $1
       WHERE gpi.pool_id = $1 AND gi.is_active = TRUE
       ORDER BY gi.rarity ASC, gi.id ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// アクティブなアイコン一覧（公開）
router.get('/icons', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, rarity, image_url FROM gacha_icons WHERE is_active=TRUE ORDER BY rarity ASC, id ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 自分の所持アイコン + 現在のポイント
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const [iconsResult, userResult] = await Promise.all([
      pool.query(
        `SELECT gi.id, gi.name, gi.rarity, gi.unit, gi.image_url, ui.acquired_at,
                (u.equipped_icon_id = gi.id) AS is_equipped
         FROM user_icons ui
         JOIN gacha_icons gi ON ui.icon_id = gi.id
         JOIN users u ON u.id = $1
         WHERE ui.user_id = $1
         ORDER BY gi.id ASC`,
        [req.user.id]
      ),
      pool.query('SELECT points, gp FROM users WHERE id=$1', [req.user.id])
    ]);
    res.json({
      icons: iconsResult.rows,
      points: userResult.rows[0]?.points || 0,
      gp: userResult.rows[0]?.gp || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// レアリティを抽選
function pickRarity(ss_rate, s_rate, forceAtLeastS = false) {
  const r = Math.random() * 100;
  if (r < ss_rate) return 'SS';
  if (forceAtLeastS || r < ss_rate + s_rate) return 'S';
  return 'A';
}

// レアリティからアイコンをランダム選択（なければ下位レアリティにフォールバック）
// SS かつ poolId ありの場合、ピックアップアイコンは各 PICKUP_RATE % の確率で当選
const PICKUP_RATE_PER_ICON = 0.75;

async function pickIcon(client, rarity, poolId, ssRate) {
  const fallback = rarity === 'SS' ? ['SS', 'S', 'A'] : rarity === 'S' ? ['S', 'A'] : ['A'];
  for (const r of fallback) {
    // SS + poolId の場合はピックアップ重み付き抽選
    if (r === 'SS' && poolId && ssRate !== undefined) {
      const res = await client.query(
        `SELECT gi.id, gi.name, gi.rarity, gi.image_url,
                (gpp.icon_id IS NOT NULL) AS is_pickup
         FROM gacha_icons gi
         JOIN gacha_pool_icons gpi ON gi.id = gpi.icon_id
         LEFT JOIN gacha_pool_pickups gpp ON gi.id = gpp.icon_id AND gpp.pool_id = $1
         WHERE gi.is_active=TRUE AND gi.rarity='SS' AND gpi.pool_id=$1`,
        [poolId]
      );
      if (res.rows.length === 0) continue; // SSアイコンなし → S/Aへフォールバック

      const pickups = res.rows.filter(ic => ic.is_pickup);
      const normals = res.rows.filter(ic => !ic.is_pickup);

      if (pickups.length === 0) {
        // ピックアップなし → 均等抽選
        return res.rows[Math.floor(Math.random() * res.rows.length)];
      }

      const totalPickupWeight = pickups.length * PICKUP_RATE_PER_ICON;
      const normalWeight = Math.max(0, ssRate - totalPickupWeight);

      if (normals.length === 0 || normalWeight <= 0) {
        // 通常SSなし or ピックアップが確率を超過 → ピックアップのみ均等
        return pickups[Math.floor(Math.random() * pickups.length)];
      }

      const normalWeightEach = normalWeight / normals.length;
      const allIcons = [...pickups, ...normals];
      const weights = [
        ...pickups.map(() => PICKUP_RATE_PER_ICON),
        ...normals.map(() => normalWeightEach)
      ];
      const total = weights.reduce((a, b) => a + b, 0);
      const rand = Math.random() * total;
      let cum = 0;
      for (let i = 0; i < allIcons.length; i++) {
        cum += weights[i];
        if (rand < cum) return allIcons[i];
      }
      return allIcons[allIcons.length - 1];
    }

    // SS以外 or poolIdなし → 通常抽選
    let result;
    if (poolId) {
      result = await client.query(
        `SELECT gi.id, gi.name, gi.rarity, gi.image_url
         FROM gacha_icons gi
         JOIN gacha_pool_icons gpi ON gi.id = gpi.icon_id
         WHERE gi.is_active=TRUE AND gi.rarity=$1 AND gpi.pool_id=$2`,
        [r, poolId]
      );
    } else {
      result = await client.query(
        'SELECT id, name, rarity, image_url FROM gacha_icons WHERE is_active=TRUE AND rarity=$1',
        [r]
      );
    }
    if (result.rows.length > 0) {
      return result.rows[Math.floor(Math.random() * result.rows.length)];
    }
  }
  return null;
}

// 共通: アイコン獲得処理（重複チェック＋補償ポイント付与）
async function acquireIcon(client, userId, icon, dupMap) {
  const ins = await client.query(
    'INSERT INTO user_icons (user_id, icon_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [userId, icon.id]
  );
  const isDup = ins.rowCount === 0;
  const dupPts = isDup ? (dupMap[icon.rarity] || 0) : 0;
  if (dupPts > 0) {
    await client.query('UPDATE users SET points=points+$1 WHERE id=$2', [dupPts, userId]);
    await client.query(
      'INSERT INTO point_history (user_id, amount, reason) VALUES ($1,$2,$3)',
      [userId, dupPts, `ガチャ重複補償（${icon.rarity}）`]
    );
  }
  return { ...icon, is_dup: isDup, dup_pts: dupPts };
}

// 単発ガチャ
router.post('/pull/single', authenticateToken, async (req, res) => {
  const { pool_id } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // pool_id 指定時はプールが存在・有効か確認
    if (pool_id) {
      const pr = await client.query('SELECT id FROM gacha_pools WHERE id=$1 AND is_active=TRUE', [pool_id]);
      if (pr.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: '指定されたガチャが存在しません' }); }
    }

    const settingsResult = await client.query(
      "SELECT key, value FROM settings WHERE key IN ('gacha_ss_rate','gacha_s_rate','gacha_single_cost','gacha_dup_ss_pts','gacha_dup_s_pts','gacha_dup_a_pts')"
    );
    const sm = {};
    settingsResult.rows.forEach(r => { sm[r.key] = r.value; });
    const ss_rate = parseFloat(sm.gacha_ss_rate || '3');
    const s_rate  = parseFloat(sm.gacha_s_rate  || '15');
    const cost    = parseInt(sm.gacha_single_cost || '50');
    const dupMap  = { SS: parseInt(sm.gacha_dup_ss_pts || '30'), S: parseInt(sm.gacha_dup_s_pts || '10'), A: parseInt(sm.gacha_dup_a_pts || '3') };

    const userResult = await client.query('SELECT points FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
    if (userResult.rows[0].points < cost) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `ポイントが不足しています（必要: ${cost}pt）` });
    }

    await client.query('UPDATE users SET points=points-$1 WHERE id=$2', [cost, req.user.id]);
    await client.query('INSERT INTO point_history (user_id, amount, reason) VALUES ($1,$2,$3)', [req.user.id, -cost, 'ガチャ（単発）']);

    const rarity = pickRarity(ss_rate, s_rate);
    const icon = await pickIcon(client, rarity, pool_id || null, ss_rate);
    if (!icon) { await client.query('ROLLBACK'); return res.status(400).json({ error: '排出可能なアイコンがありません' }); }

    const result = await acquireIcon(client, req.user.id, icon, dupMap);
    await client.query('UPDATE users SET gp=gp+1 WHERE id=$1', [req.user.id]);
    await client.query('INSERT INTO gp_history (user_id, amount, reason) VALUES ($1,1,$2)', [req.user.id, 'ガチャ（単発）']);
    const newPoints = userResult.rows[0].points - cost + result.dup_pts;
    const gpResult = await client.query('SELECT gp FROM users WHERE id=$1', [req.user.id]);
    await client.query('COMMIT');
    res.json({ results: [result], new_points: newPoints, new_gp: gpResult.rows[0].gp });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// 10連ガチャ（最後の1枚はSレア以上確定）
router.post('/pull/multi', authenticateToken, async (req, res) => {
  const { pool_id } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // pool_id 指定時はプールが存在・有効か確認
    if (pool_id) {
      const pr = await client.query('SELECT id FROM gacha_pools WHERE id=$1 AND is_active=TRUE', [pool_id]);
      if (pr.rows.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: '指定されたガチャが存在しません' }); }
    }

    const settingsResult = await client.query(
      "SELECT key, value FROM settings WHERE key IN ('gacha_ss_rate','gacha_s_rate','gacha_multi_cost','gacha_dup_ss_pts','gacha_dup_s_pts','gacha_dup_a_pts')"
    );
    const sm = {};
    settingsResult.rows.forEach(r => { sm[r.key] = r.value; });
    const ss_rate = parseFloat(sm.gacha_ss_rate || '3');
    const s_rate  = parseFloat(sm.gacha_s_rate  || '15');
    const cost    = parseInt(sm.gacha_multi_cost || '450');
    const dupMap  = { SS: parseInt(sm.gacha_dup_ss_pts || '30'), S: parseInt(sm.gacha_dup_s_pts || '10'), A: parseInt(sm.gacha_dup_a_pts || '3') };

    const userResult = await client.query('SELECT points FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
    if (userResult.rows[0].points < cost) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `ポイントが不足しています（必要: ${cost}pt）` });
    }

    await client.query('UPDATE users SET points=points-$1 WHERE id=$2', [cost, req.user.id]);
    await client.query('INSERT INTO point_history (user_id, amount, reason) VALUES ($1,$2,$3)', [req.user.id, -cost, 'ガチャ（10連）']);

    const results = [];
    let totalDupPts = 0;
    for (let i = 0; i < 10; i++) {
      const forceS = (i === 9);
      const rarity = pickRarity(ss_rate, s_rate, forceS);
      const icon = await pickIcon(client, rarity, pool_id || null, ss_rate);
      if (!icon) { await client.query('ROLLBACK'); return res.status(400).json({ error: '排出可能なアイコンがありません' }); }
      const result = await acquireIcon(client, req.user.id, icon, dupMap);
      results.push(result);
      totalDupPts += result.dup_pts;
    }

    await client.query('UPDATE users SET gp=gp+10 WHERE id=$1', [req.user.id]);
    await client.query('INSERT INTO gp_history (user_id, amount, reason) VALUES ($1,10,$2)', [req.user.id, 'ガチャ（10連）']);
    const newPoints = userResult.rows[0].points - cost + totalDupPts;
    const gpResult = await client.query('SELECT gp FROM users WHERE id=$1', [req.user.id]);
    await client.query('COMMIT');
    res.json({ results, new_points: newPoints, new_gp: gpResult.rows[0].gp });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// GP交換（200GP → SSアイコン選択）
router.post('/exchange', authenticateToken, async (req, res) => {
  const GP_COST = 200;
  const { icon_id } = req.body;
  if (!icon_id) return res.status(400).json({ error: 'アイコンを選択してください' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query('SELECT gp FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
    if (userResult.rows[0].gp < GP_COST) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `GPが不足しています（必要: ${GP_COST}GP）` });
    }

    const iconResult = await client.query(
      'SELECT id, name, rarity, image_url FROM gacha_icons WHERE id=$1 AND rarity=$2 AND is_active=TRUE',
      [icon_id, 'SS']
    );
    if (iconResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '対象のSSアイコンが見つかりません' });
    }
    const icon = iconResult.rows[0];

    const ownedResult = await client.query(
      'SELECT 1 FROM user_icons WHERE user_id=$1 AND icon_id=$2',
      [req.user.id, icon_id]
    );
    if (ownedResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `「${icon.name}」はすでに所持しています` });
    }

    const settingsResult = await client.query(
      "SELECT key, value FROM settings WHERE key IN ('gacha_dup_ss_pts')"
    );
    const sm = {};
    settingsResult.rows.forEach(r => { sm[r.key] = r.value; });
    const dupMap = { SS: parseInt(sm.gacha_dup_ss_pts || '30'), S: 0, A: 0 };

    await client.query('UPDATE users SET gp=gp-$1 WHERE id=$2', [GP_COST, req.user.id]);
    await client.query('INSERT INTO gp_history (user_id, amount, reason) VALUES ($1,$2,$3)', [req.user.id, -GP_COST, `GP交換（${icon.name}）`]);
    const result = await acquireIcon(client, req.user.id, icon, dupMap);
    const gpResult = await client.query('SELECT gp FROM users WHERE id=$1', [req.user.id]);
    await client.query('COMMIT');
    res.json({ result, new_gp: gpResult.rows[0].gp });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// GP移行（過去のガチャ回数分を一度だけ付与）
router.post('/gp-migrate', authenticateToken, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT gp_migrated FROM users WHERE id=$1', [req.user.id]);
    if (userResult.rows[0].gp_migrated) return res.json({ gp_awarded: 0, already_done: true });

    const histResult = await pool.query(
      `SELECT reason, COUNT(*) AS cnt FROM point_history
       WHERE user_id=$1 AND reason IN ('ガチャ（単発）','ガチャ（10連）')
       GROUP BY reason`,
      [req.user.id]
    );
    let gp = 0;
    for (const row of histResult.rows) {
      if (row.reason === 'ガチャ（単発）') gp += parseInt(row.cnt);
      if (row.reason === 'ガチャ（10連）') gp += parseInt(row.cnt) * 10;
    }
    const updated = await pool.query(
      'UPDATE users SET gp=gp+$1, gp_migrated=TRUE WHERE id=$2 RETURNING gp',
      [gp, req.user.id]
    );
    if (gp > 0) {
      await pool.query(
        'INSERT INTO gp_history (user_id, amount, reason) VALUES ($1,$2,$3)',
        [req.user.id, gp, '初回GP移行（過去のガチャ回数分）']
      );
    }
    res.json({ gp_awarded: gp, new_gp: updated.rows[0].gp });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// アイコン装備
router.post('/equip', authenticateToken, async (req, res) => {
  const { icon_id } = req.body;
  try {
    if (icon_id === null || icon_id === undefined) {
      await pool.query('UPDATE users SET equipped_icon_id=NULL WHERE id=$1', [req.user.id]);
      return res.json({ message: 'アイコンを外しました' });
    }
    const owned = await pool.query(
      'SELECT 1 FROM user_icons WHERE user_id=$1 AND icon_id=$2',
      [req.user.id, icon_id]
    );
    if (owned.rows.length === 0) return res.status(403).json({ error: 'このアイコンは所持していません' });
    await pool.query('UPDATE users SET equipped_icon_id=$1 WHERE id=$2', [icon_id, req.user.id]);
    res.json({ message: 'アイコンを装備しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
