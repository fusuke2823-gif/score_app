const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const pool = require('../db/index');
const { authenticateToken } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const ROOMS = ['火', '氷', '雷', '光', '闇', '無'];

const postLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '投稿が多すぎます。少し待ってから再試行してください。' },
});

function mapMessage(r) {
  return {
    id: r.id, body: r.body, image_url: r.image_url, created_at: r.created_at,
    user_id: r.user_id, username: r.username, is_admin: r.role === 'admin',
  };
}

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
        `SELECT cm.id, cm.body, cm.image_url, cm.created_at, cm.user_id, u.username, u.role
         FROM chat_messages cm JOIN users u ON u.id = cm.user_id
         WHERE cm.room = $1 AND cm.id > $2
         ORDER BY cm.id ASC
         LIMIT 200`,
        [room, afterId]
      );
    } else {
      const recent = await pool.query(
        `SELECT cm.id, cm.body, cm.image_url, cm.created_at, cm.user_id, u.username, u.role
         FROM chat_messages cm JOIN users u ON u.id = cm.user_id
         WHERE cm.room = $1
         ORDER BY cm.id DESC
         LIMIT 50`,
        [room]
      );
      result = { rows: recent.rows.reverse() };
    }
    res.json(result.rows.map(mapMessage));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 投稿（本文・画像のどちらか、または両方）
router.post('/:room', postLimiter, authenticateToken, upload.single('image'), async (req, res) => {
  const { room } = req.params;
  if (!ROOMS.includes(room)) return res.status(400).json({ error: '不正な部屋です' });
  const body = (req.body?.body || '').trim();
  if (!body && !req.file) return res.status(400).json({ error: '内容を入力してください' });
  if (body.length > 300) return res.status(400).json({ error: '300文字以内で入力してください' });

  try {
    let imageUrl = null, imagePublicId = null;
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ folder: 'hbr-ranking/chat', resource_type: 'image' }, (err, r) => {
            if (err) reject(err); else resolve(r);
          })
          .end(req.file.buffer);
      });
      imageUrl = result.secure_url;
      imagePublicId = result.public_id;
    }

    const result = await pool.query(
      `INSERT INTO chat_messages (room, user_id, body, image_url, image_public_id) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, body, image_url, created_at, user_id`,
      [room, req.user.id, body || null, imageUrl, imagePublicId]
    );
    const m = result.rows[0];
    res.json({
      id: m.id, body: m.body, image_url: m.image_url, created_at: m.created_at,
      user_id: m.user_id, username: req.user.username, is_admin: req.user.role === 'admin',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
