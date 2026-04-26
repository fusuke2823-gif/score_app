const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { authenticateToken } = require('../middleware/auth');
const { optimizeUrl } = require('../utils/cloudinary');

router.use(authenticateToken);

// 自分の動画一覧
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT vb.id, vb.event_id, vb.attribute, vb.video_url,
              vb.approved_image_url, vb.approved_score, vb.hidden, vb.created_at,
              e.name AS event_name, e.event_number
       FROM video_board vb
       JOIN events e ON e.id = vb.event_id
       WHERE vb.user_id = $1
       ORDER BY vb.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows.map(r => ({
      ...r,
      approved_image_url: optimizeUrl(r.approved_image_url),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 承認待ち動画一覧
router.get('/pending', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pv.id, pv.event_id, pv.attribute, pv.video_url,
              pv.status, pv.admin_note, pv.created_at,
              e.name AS event_name, e.event_number
       FROM pending_videos pv
       JOIN events e ON e.id = pv.event_id
       WHERE pv.user_id = $1
       ORDER BY pv.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 承認待ちキャンセル
router.delete('/pending/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM pending_videos WHERE id = $1 AND user_id = $2 AND status = 'pending' RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: '見つかりません' });
    res.json({ message: 'キャンセルしました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 動画のみ投稿
router.post('/pending', async (req, res) => {
  const { event_id, attribute, video_url } = req.body;
  if (!event_id || !attribute || !video_url)
    return res.status(400).json({ error: '必須項目が不足しています' });

  const ytUrl = video_url.trim();
  if (!/^https?:\/\/(www\.)?(youtube\.com\/(watch|shorts|live)|youtu\.be\/)/.test(ytUrl))
    return res.status(400).json({ error: 'YouTubeのURLのみ入力できます' });

  try {
    const scoreCheck = await pool.query(
      `SELECT id FROM scores WHERE user_id = $1 AND event_id = $2 AND attribute = $3 AND approved_score IS NOT NULL`,
      [req.user.id, event_id, attribute]
    );
    if (!scoreCheck.rows.length)
      return res.status(400).json({ error: 'このイベント・属性の承認済みスコアがありません' });

    const dup = await pool.query(
      `SELECT id FROM pending_videos WHERE user_id = $1 AND event_id = $2 AND attribute = $3 AND video_url = $4 AND status = 'pending'`,
      [req.user.id, event_id, attribute, ytUrl]
    );
    if (dup.rows.length)
      return res.status(400).json({ error: '同じ動画が既に承認待ちです' });

    await pool.query(
      `INSERT INTO pending_videos (user_id, event_id, attribute, video_url) VALUES ($1, $2, $3, $4)`,
      [req.user.id, event_id, attribute, ytUrl]
    );
    res.json({ message: '動画を投稿しました。管理者の承認をお待ちください。' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 非表示トグル
router.put('/:id/toggle-hidden', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE video_board SET hidden = NOT hidden WHERE id = $1 AND user_id = $2 RETURNING id, hidden`,
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: '動画が見つかりません' });
    res.json({ hidden: result.rows[0].hidden });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 削除
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM video_board WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: '動画が見つかりません' });
    res.json({ message: '削除しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
