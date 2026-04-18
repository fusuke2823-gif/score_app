const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// メッセージ一覧をfeedback_idで取得するヘルパー
async function getMessages(feedbackId) {
  const r = await pool.query(
    `SELECT fm.id, fm.body, fm.created_at,
            fm.user_id, u.username
     FROM feedback_messages fm
     LEFT JOIN users u ON fm.user_id = u.id
     WHERE fm.feedback_id=$1
     ORDER BY fm.created_at ASC`,
    [feedbackId]
  );
  return r.rows.map(m => ({ ...m, is_admin: m.user_id === null }));
}

async function getHourlyChars(userId) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(LENGTH(body)), 0) AS total FROM (
       SELECT body FROM feedback WHERE user_id=$1 AND created_at > NOW() - INTERVAL '1 hour'
       UNION ALL
       SELECT body FROM feedback_messages WHERE user_id=$1 AND created_at > NOW() - INTERVAL '1 hour'
     ) t`,
    [userId]
  );
  return parseInt(r.rows[0].total);
}

// 送信
router.post('/', authenticateToken, async (req, res) => {
  const { category, body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: '内容を入力してください' });
  if (body.length > 1000) return res.status(400).json({ error: '1000文字以内で入力してください' });
  const cat = ['機能要望', 'バグ報告', 'その他'].includes(category) ? category : 'その他';
  try {
    if (req.user.role !== 'admin') {
      const used = await getHourlyChars(req.user.id);
      if (used + body.trim().length > 2000)
        return res.status(429).json({ error: `1時間あたり2000文字の上限に達しています（使用済み: ${used}文字）` });
    }
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

// 管理者：一覧取得（メッセージ含む）
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.id, f.category, f.body, f.is_read, f.reply_read, f.created_at, u.username
       FROM feedback f LEFT JOIN users u ON f.user_id = u.id
       ORDER BY f.created_at DESC`
    );
    const rows = await Promise.all(result.rows.map(async f => ({
      ...f,
      messages: await getMessages(f.id)
    })));
    res.json(rows);
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

// 管理者：返信（feedback_messagesに追加 + reply/replied_at更新 + reply_read=false）
router.patch('/:id/reply', authenticateToken, requireAdmin, async (req, res) => {
  const { reply } = req.body;
  if (!reply || !reply.trim()) return res.status(400).json({ error: '返信内容を入力してください' });
  if (reply.length > 1000) return res.status(400).json({ error: '1000文字以内で入力してください' });
  const fid = req.params.id;
  try {
    await pool.query(
      'INSERT INTO feedback_messages (feedback_id, user_id, body) VALUES ($1, NULL, $2)',
      [fid, reply.trim()]
    );
    await pool.query(
      'UPDATE feedback SET reply=$1, replied_at=NOW(), is_read=TRUE, reply_read=FALSE WHERE id=$2',
      [reply.trim(), fid]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ユーザー：自分のお便り一覧（メッセージ含む）
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, category, body, reply, replied_at, reply_read, is_read, created_at
       FROM feedback WHERE user_id=$1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    const rows = await Promise.all(result.rows.map(async f => ({
      ...f,
      messages: await getMessages(f.id)
    })));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ユーザー：未読返信数
router.get('/unread-reply-count', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) FROM feedback WHERE user_id=$1 AND reply IS NOT NULL AND reply_read=FALSE`,
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ユーザー：返信を既読にする
router.patch('/mark-replies-read', authenticateToken, async (req, res) => {
  try {
    await pool.query(
      `UPDATE feedback SET reply_read=TRUE WHERE user_id=$1 AND reply IS NOT NULL AND reply_read=FALSE`,
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ユーザー：追加返信（自分のfeedbackのみ）
router.post('/:id/user-reply', authenticateToken, async (req, res) => {
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: '内容を入力してください' });
  if (body.length > 1000) return res.status(400).json({ error: '1000文字以内で入力してください' });
  const fid = req.params.id;
  try {
    const check = await pool.query('SELECT id FROM feedback WHERE id=$1 AND user_id=$2', [fid, req.user.id]);
    if (check.rows.length === 0) return res.status(403).json({ error: '権限がありません' });
    if (req.user.role !== 'admin') {
      const used = await getHourlyChars(req.user.id);
      if (used + body.trim().length > 2000)
        return res.status(429).json({ error: `1時間あたり2000文字の上限に達しています（使用済み: ${used}文字）` });
    }
    await pool.query(
      'INSERT INTO feedback_messages (feedback_id, user_id, body) VALUES ($1, $2, $3)',
      [fid, req.user.id, body.trim()]
    );
    // 管理者への未読フラグ（is_readをfalseに戻す）
    await pool.query('UPDATE feedback SET is_read=FALSE WHERE id=$1', [fid]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
