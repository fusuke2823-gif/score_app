const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { frameByClass, getFrameStats, condProgress } = require('../utils/frames');
const { seasonByKey } = require('../utils/seasons');

// 購入可能な称号一覧（ログイン不要）
router.get('/titles', async (req, res) => {
  try {
    const { tag } = req.query;
    let query, params = [];
    if (tag) {
      params.push(tag);
      query = `SELECT * FROM titles WHERE is_active = TRUE AND point_cost IS NOT NULL AND tag = $1 ORDER BY sort_order ASC NULLS LAST, name ASC`;
    } else {
      query = `SELECT * FROM titles WHERE is_active = TRUE AND point_cost IS NOT NULL AND (tag IS NULL OR tag = '') ORDER BY point_cost ASC, name ASC`;
    }
    const titles = await pool.query(query, params);
    res.json(titles.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ショップにフレームのタブを出すか（管理画面で切り替える。未設定は出さない）
router.get('/frames-tab', async (req, res) => {
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key = 'shop_frames_tab'");
    res.json({ show: r.rows[0]?.value === 'true' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 購入可能なフレーム一覧（買えるようになる条件と、ログイン中ならその進み具合つき）
router.get('/frames', optionalAuth, async (req, res) => {
  try {
    const frames = await pool.query(
      'SELECT * FROM frames WHERE is_active = TRUE ORDER BY point_cost ASC'
    );
    // 管理者は条件なしで買える（進み具合は出す）
    const free = req.user?.role === 'admin';
    const stats = req.user ? await getFrameStats(pool, req.user.id) : null;
    // シーズン1位のフレーム：シーズン中は「1位の報酬」として見せる（買えない）。締めたら1位の人にだけ見せ、pt で買える
    const winners = new Map((await pool.query('SELECT season_key, winner_user_id FROM seasons_done')).rows.map(r => [r.season_key, r.winner_user_id]));
    res.json(frames.rows.flatMap(f => {
      const def = frameByClass(f.css_class);
      if (def?.season) {
        const se = seasonByKey(def.season);
        const reward = { key: def.season, name: se?.name || def.season, done: winners.has(def.season) };
        if (!reward.done) return [{ ...f, conds: [], season_reward: reward }];
        if (!req.user || winners.get(def.season) !== req.user.id) return [];
        return [{ ...f, conds: [], season_reward: reward, free: true }];
      }
      const conds = def?.conds || [];
      return [{ ...f, conds, free, progress: stats && conds.length ? condProgress(conds, stats) : null }];
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 自分のポイント・所持称号・装備中称号
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT points, equipped_title_id, equipped_internal_title_id, equipped_frame_id FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userResult.rows[0];

    const myTitles = await pool.query(
      `SELECT t.*, ut.acquired_at
       FROM user_titles ut
       JOIN titles t ON ut.title_id = t.id
       WHERE ut.user_id = $1
       ORDER BY ut.acquired_at DESC`,
      [req.user.id]
    );

    const myFrames = await pool.query(
      `SELECT f.*, uf.acquired_at
       FROM user_frames uf
       JOIN frames f ON uf.frame_id = f.id
       WHERE uf.user_id = $1
       ORDER BY uf.acquired_at DESC`,
      [req.user.id]
    );

    res.json({
      points: user.points,
      equipped_title_id: user.equipped_title_id,
      equipped_internal_title_id: user.equipped_internal_title_id,
      equipped_frame_id: user.equipped_frame_id,
      titles: myTitles.rows,
      frames: myFrames.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 称号購入
router.post('/buy/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const titleResult = await client.query(
      'SELECT * FROM titles WHERE id = $1 AND is_active = TRUE AND point_cost IS NOT NULL',
      [req.params.id]
    );
    if (titleResult.rows.length === 0)
      return res.status(404).json({ error: '称号が見つかりません' });

    const title = titleResult.rows[0];

    // 既所持チェック
    const owned = await client.query(
      'SELECT id FROM user_titles WHERE user_id = $1 AND title_id = $2',
      [req.user.id, title.id]
    );
    if (owned.rows.length > 0)
      return res.status(409).json({ error: 'すでに所持しています' });

    // ポイントチェック
    const userResult = await client.query('SELECT points FROM users WHERE id = $1', [req.user.id]);
    const currentPoints = userResult.rows[0].points;
    if (currentPoints < title.point_cost)
      return res.status(400).json({ error: `ポイントが不足しています（現在: ${currentPoints}pt）` });

    // ポイント消費
    await client.query(
      'UPDATE users SET points = points - $1 WHERE id = $2',
      [title.point_cost, req.user.id]
    );
    await client.query(
      'INSERT INTO point_history (user_id, amount, reason) VALUES ($1, $2, $3)',
      [req.user.id, -title.point_cost, `称号購入: ${title.name}`]
    );

    // 称号付与
    await client.query(
      'INSERT INTO user_titles (user_id, title_id) VALUES ($1, $2)',
      [req.user.id, title.id]
    );

    await client.query('COMMIT');

    const newPoints = currentPoints - title.point_cost;
    res.json({ message: `「${title.name}」を購入しました`, points: newPoints });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// フレーム購入
router.post('/frames/buy/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const frameResult = await client.query(
      'SELECT * FROM frames WHERE id=$1 AND is_active=TRUE',
      [req.params.id]
    );
    if (frameResult.rows.length === 0)
      return res.status(404).json({ error: 'フレームが見つかりません' });
    const frame = frameResult.rows[0];

    const owned = await client.query(
      'SELECT id FROM user_frames WHERE user_id=$1 AND frame_id=$2',
      [req.user.id, frame.id]
    );
    if (owned.rows.length > 0)
      return res.status(409).json({ error: 'すでに所持しています' });

    // シーズン1位のフレームは、シーズンを締めたあと1位の人だけ買える
    const seasonKey = frameByClass(frame.css_class)?.season;
    if (seasonKey) {
      const w = await client.query('SELECT winner_user_id FROM seasons_done WHERE season_key = $1', [seasonKey]);
      if (!w.rows.length) return res.status(403).json({ error: 'シーズンが終わるまで購入できません' });
      if (w.rows[0].winner_user_id !== req.user.id) return res.status(403).json({ error: 'このフレームはシーズン1位の人だけが購入できます' });
    }
    const conds = frameByClass(frame.css_class)?.conds || [];
    if (conds.length && req.user.role !== 'admin' && !condProgress(conds, await getFrameStats(client, req.user.id)).met)
      return res.status(403).json({ error: 'このフレームを買う条件をまだ満たしていません' });

    const userResult = await client.query('SELECT points FROM users WHERE id=$1', [req.user.id]);
    if (userResult.rows[0].points < frame.point_cost)
      return res.status(400).json({ error: `ポイントが不足しています（現在: ${userResult.rows[0].points}pt）` });

    await client.query('UPDATE users SET points=points-$1 WHERE id=$2', [frame.point_cost, req.user.id]);
    await client.query('INSERT INTO point_history (user_id, amount, reason) VALUES ($1,$2,$3)',
      [req.user.id, -frame.point_cost, `フレーム購入: ${frame.name}`]);
    await client.query('INSERT INTO user_frames (user_id, frame_id) VALUES ($1,$2)', [req.user.id, frame.id]);
    await client.query('COMMIT');

    const newPoints = userResult.rows[0].points - frame.point_cost;
    res.json({ message: `「${frame.name}」を購入しました`, points: newPoints });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// フレームを装備（frame_id: null で解除）
router.post('/frames/equip', authenticateToken, async (req, res) => {
  const { frame_id } = req.body;
  try {
    if (frame_id) {
      const owned = await pool.query(
        'SELECT id FROM user_frames WHERE user_id=$1 AND frame_id=$2',
        [req.user.id, frame_id]
      );
      if (owned.rows.length === 0)
        return res.status(403).json({ error: 'このフレームを所持していません' });
    }
    await pool.query('UPDATE users SET equipped_frame_id=$1 WHERE id=$2', [frame_id || null, req.user.id]);
    res.json({ message: frame_id ? 'フレームを装備しました' : 'フレームを外しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 称号を装備（title_id: null で解除）― 外部ランキング用（external/common のみ）
router.post('/equip', authenticateToken, async (req, res) => {
  const { title_id } = req.body;
  try {
    if (title_id) {
      const owned = await pool.query(
        'SELECT id FROM user_titles WHERE user_id = $1 AND title_id = $2',
        [req.user.id, title_id]
      );
      if (owned.rows.length === 0)
        return res.status(403).json({ error: 'この称号を所持していません' });
      const titleRes = await pool.query('SELECT scope FROM titles WHERE id=$1', [title_id]);
      const scope = titleRes.rows[0]?.scope || 'common';
      if (scope === 'internal')
        return res.status(403).json({ error: 'この称号は内部ランキング用装備枠には使用できません' });
    }
    await pool.query(
      'UPDATE users SET equipped_title_id = $1 WHERE id = $2',
      [title_id || null, req.user.id]
    );
    res.json({ message: title_id ? '称号を装備しました' : '称号を外しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 内部ランキング用称号を装備（title_id: null で解除）― internal/common のみ
router.post('/equip-internal', authenticateToken, async (req, res) => {
  const { title_id } = req.body;
  if (!req.user.is_internal)
    return res.status(403).json({ error: '内部ユーザー限定の機能です' });
  try {
    if (title_id) {
      const owned = await pool.query(
        'SELECT id FROM user_titles WHERE user_id = $1 AND title_id = $2',
        [req.user.id, title_id]
      );
      if (owned.rows.length === 0)
        return res.status(403).json({ error: 'この称号を所持していません' });
      const titleRes = await pool.query('SELECT scope FROM titles WHERE id=$1', [title_id]);
      const scope = titleRes.rows[0]?.scope || 'common';
      if (scope === 'external')
        return res.status(403).json({ error: 'この称号は外部ランキング用装備枠には使用できません' });
    }
    await pool.query(
      'UPDATE users SET equipped_internal_title_id = $1 WHERE id = $2',
      [title_id || null, req.user.id]
    );
    res.json({ message: title_id ? '内部称号を装備しました' : '内部称号を外しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// /my に equipped_internal_title_id を追加で返す
router.get('/my/internal-equip', authenticateToken, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT equipped_title_id, equipped_internal_title_id FROM users WHERE id=$1',
      [req.user.id]
    );
    res.json(r.rows[0] || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
