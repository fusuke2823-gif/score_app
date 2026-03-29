const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// 送信
router.post('/', authenticateToken, async (req, res) => {
  const { category, body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: '内容を入力してください' });
  if (body.length > 1000) return res.status(400).json({ error: '1000文字以内で入力してください' });
  const cat = ['機能要望', 'バグ報告', 'その他'].includes(category) ? category : 'その他';
  try {
    await pool.query(
      'INSERT INTO feedback (user_id, category, body) VALUES ($1,$2,$3)',
      [req.user.id, cat, body.trim()]
    );
    res.json({ message: '送信しました。ありがとうございます！' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 管理者：一覧取得
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.id, f.category, f.body, f.is_read, f.created_at, u.username
       FROM feedback f LEFT JOIN users u ON f.user_id = u.id
       ORDER BY f.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 管理者：既読
router.patch('/:id/read', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE feedback SET is_read=TRUE WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
