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
        `SELECT gi.id, gi.name, gi.rarity, gi.image_url, ui.acquired_at,
                (u.equipped_icon_id = gi.id) AS is_equipped
         FROM user_icons ui
         JOIN gacha_icons gi ON ui.icon_id = gi.id
         JOIN users u ON u.id = $1
         WHERE ui.user_id = $1
         ORDER BY gi.rarity ASC, ui.acquired_at DESC`,
        [req.user.id]
      ),
      pool.query('SELECT points FROM users WHERE id=$1', [req.user.id])
    ]);
    res.json({
      icons: iconsResult.rows,
      points: userResult.rows[0]?.points || 0
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
async function pickIcon(client, rarity) {
  const fallback = rarity === 'SS' ? ['SS', 'S', 'A'] : rarity === 'S' ? ['S', 'A'] : ['A'];
  for (const r of fallback) {
    const result = await client.query(
      'SELECT id, name, rarity, image_url FROM gacha_icons WHERE is_active=TRUE AND rarity=$1',
      [r]
    );
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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
    const icon = await pickIcon(client, rarity);
    if (!icon) { await client.query('ROLLBACK'); return res.status(400).json({ error: '排出可能なアイコンがありません' }); }

    const result = await acquireIcon(client, req.user.id, icon, dupMap);
    const newPoints = userResult.rows[0].points - cost + result.dup_pts;
    await client.query('COMMIT');
    res.json({ results: [result], new_points: newPoints });
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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
      const icon = await pickIcon(client, rarity);
      if (!icon) { await client.query('ROLLBACK'); return res.status(400).json({ error: '排出可能なアイコンがありません' }); }
      const result = await acquireIcon(client, req.user.id, icon, dupMap);
      results.push(result);
      totalDupPts += result.dup_pts;
    }

    const newPoints = userResult.rows[0].points - cost + totalDupPts;
    await client.query('COMMIT');
    res.json({ results, new_points: newPoints });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
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
