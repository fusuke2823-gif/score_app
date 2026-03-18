const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const pool = require('../db/index');
const { authenticateToken } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const VALID_ATTRIBUTES = ['火', '氷', '雷', '光', '闇', '無'];

// スコア投稿
router.post('/', authenticateToken, upload.single('image'), async (req, res) => {
  const { event_id, attribute, score } = req.body;

  if (!event_id || !attribute || score === undefined)
    return res.status(400).json({ error: '必須項目が不足しています' });
  if (!VALID_ATTRIBUTES.includes(attribute))
    return res.status(400).json({ error: '無効な属性です' });

  const scoreNum = parseInt(score);
  if (isNaN(scoreNum) || scoreNum < 0)
    return res.status(400).json({ error: '無効なスコアです' });

  try {
    let imageUrl = null;
    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ folder: 'hbr-ranking/results', resource_type: 'image' }, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          })
          .end(req.file.buffer);
      });
      imageUrl = uploadResult.secure_url;
    }

    const result = await pool.query(
      `INSERT INTO scores (user_id, event_id, attribute, pending_score, pending_image_url, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
       ON CONFLICT (user_id, event_id, attribute) DO UPDATE SET
         pending_score = $4,
         pending_image_url = COALESCE($5, scores.pending_image_url),
         status = 'pending',
         updated_at = NOW()
       RETURNING *`,
      [req.user.id, event_id, attribute, scoreNum, imageUrl]
    );

    res.json({ message: 'スコアを投稿しました。管理者の承認をお待ちください。', score: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 自分のスコア一覧（イベント別）
router.get('/my/:event_id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM scores WHERE user_id = $1 AND event_id = $2 ORDER BY attribute',
      [req.user.id, req.params.event_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
