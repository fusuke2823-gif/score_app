const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { authenticateToken } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const ROOMS = ['火', '氷', '雷', '光', '闇', '無'];

const postLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '投稿が多すぎます。少し待ってから再試行してください。' },
});

// メッセージ取得
// after_id を指定するとそれより新しい分だけ（ポーリング用）、指定なしなら直近50件
router.get('/:room', authenticateToken, async (req, res) => {
  const { room } = req.params;
  if (!ROOMS.includes(room)) return res.status(400).json({ error: '不正な部屋です' });
  const afterId = req.query.after_id ? parseInt(req.query.after_id, 10) : null;

  try {
    let result;
    if (afterId != null && Number.isFinite(afterId)) {
      result = await pool.query(
        `SELECT cm.id, cm.body, cm.created_at, cm.user_id, u.username, u.role
         FROM chat_messages cm JOIN users u ON u.id = cm.user_id
         WHERE cm.room = $1 AND cm.id > $2
         ORDER BY cm.id ASC
         LIMIT 200`,
        [room, afterId]
      );
    } else {
      const recent = await pool.query(
        `SELECT cm.id, cm.body, cm.created_at, cm.user_id, u.username, u.role
         FROM chat_messages cm JOIN users u ON u.id = cm.user_id
         WHERE cm.room = $1
         ORDER BY cm.id DESC
         LIMIT 50`,
        [room]
      );
      result = { rows: recent.rows.reverse() };
    }
    res.json(result.rows.map(r => ({
      id: r.id, body: r.body, created_at: r.created_at,
      user_id: r.user_id, username: r.username, is_admin: r.role === 'admin',
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 投稿
router.post('/:room', postLimiter, authenticateToken, async (req, res) => {
  const { room } = req.params;
  if (!ROOMS.includes(room)) return res.status(400).json({ error: '不正な部屋です' });
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: '内容を入力してください' });
  if (body.length > 300) return res.status(400).json({ error: '300文字以内で入力してください' });

  try {
    const result = await pool.query(
      `INSERT INTO chat_messages (room, user_id, body) VALUES ($1, $2, $3)
       RETURNING id, body, created_at, user_id`,
      [room, req.user.id, body.trim()]
    );
    const m = result.rows[0];
    res.json({
      id: m.id, body: m.body, created_at: m.created_at,
      user_id: m.user_id, username: req.user.username, is_admin: req.user.role === 'admin',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
