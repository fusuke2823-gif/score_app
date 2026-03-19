const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { authenticateToken } = require('../middleware/auth');

// 購入可能な称号一覧（ログイン不要）
router.get('/titles', async (req, res) => {
  try {
    const titles = await pool.query(
      'SELECT * FROM titles WHERE is_active = TRUE AND point_cost IS NOT NULL ORDER BY point_cost ASC'
    );
    res.json(titles.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 自分のポイント・所持称号・装備中称号
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT points, equipped_title_id FROM users WHERE id = $1',
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

    res.json({
      points: user.points,
      equipped_title_id: user.equipped_title_id,
      titles: myTitles.rows
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

// 称号を装備（title_id: null で解除）
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

module.exports = router;
