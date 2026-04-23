const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const pool = require('../db/index');
const { authenticateToken } = require('../middleware/auth');
const { sendScoreNotification } = require('../utils/mailer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const VALID_ATTRIBUTES = ['火', '氷', '雷', '光', '闇', '無'];

// スコア投稿
router.post('/', authenticateToken, upload.single('image'), async (req, res) => {
  const { event_id, attribute, score, is_anonymous, ranking_scope, youtube_url, keep_youtube } = req.body;

  if (!event_id || !attribute || score === undefined)
    return res.status(400).json({ error: '必須項目が不足しています' });
  if (!VALID_ATTRIBUTES.includes(attribute))
    return res.status(400).json({ error: '無効な属性です' });

  const scoreNum = parseInt(score);
  if (isNaN(scoreNum) || scoreNum < 0)
    return res.status(400).json({ error: '無効なスコアです' });

  const ytUrl = youtube_url ? youtube_url.trim() : null;
  if (ytUrl && !/^https?:\/\/(www\.)?(youtube\.com\/(watch|shorts|live)|youtu\.be\/)/.test(ytUrl))
    return res.status(400).json({ error: 'YouTubeのURLのみ入力できます' });
  const keepYt = keep_youtube === 'true' || keep_youtube === true;
  const ytScore = ytUrl ? parseInt(score) : null;

  try {
    // 投稿期間チェック
    const eventResult = await pool.query('SELECT name, submission_start, submission_end FROM events WHERE id = $1', [event_id]);
    if (eventResult.rows.length === 0)
      return res.status(404).json({ error: 'イベントが見つかりません' });
    const { submission_start, submission_end } = eventResult.rows[0];
    const now = new Date();
    if (submission_start && now < new Date(submission_start))
      return res.status(403).json({ error: 'まだ投稿期間が始まっていません' });
    if (submission_end && now > new Date(submission_end))
      return res.status(403).json({ error: '投稿期間が終了しています' });
    let imageUrl = null;
    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ folder: 'hbr-ranking/results', resource_type: 'image', quality: 'auto:good', fetch_format: 'auto', width: 1080, crop: 'limit' }, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          })
          .end(req.file.buffer);
      });
      imageUrl = uploadResult.secure_url;
    }

    // 内部ユーザーのみ ranking_scope='public' を選択可。外部ユーザーは常に 'public'
    const userResult = await pool.query('SELECT is_internal FROM users WHERE id = $1', [req.user.id]);
    const isInternal = userResult.rows[0]?.is_internal ?? false;
    const scopeVal = isInternal && ranking_scope === 'public' ? 'public' : (isInternal ? 'internal' : 'public');

    const result = await pool.query(
      `INSERT INTO scores (user_id, event_id, attribute, pending_score, pending_image_url, status, updated_at, is_anonymous, ranking_scope, youtube_url, youtube_score)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), $6, $7, $8, $9)
       ON CONFLICT (user_id, event_id, attribute) DO UPDATE SET
         pending_score = $4,
         pending_image_url = COALESCE($5, scores.pending_image_url),
         status = 'pending',
         is_anonymous = $6,
         ranking_scope = $7,
         youtube_url = CASE WHEN $8 IS NOT NULL THEN $8 WHEN $10 THEN scores.youtube_url ELSE NULL END,
         youtube_score = CASE WHEN $8 IS NOT NULL THEN $9 WHEN $10 THEN scores.youtube_score ELSE NULL END,
         updated_at = NOW()
       RETURNING *`,
      [req.user.id, event_id, attribute, scoreNum, imageUrl, is_anonymous === 'true' || is_anonymous === true, scopeVal, ytUrl, ytScore, keepYt]
    );

    res.json({ message: 'スコアを投稿しました。管理者の承認をお待ちください。', score: result.rows[0] });

    // メール通知（非同期・失敗してもレスポンスに影響しない）
    sendScoreNotification({
      username: req.user.username,
      eventName: eventResult.rows[0].name,
      attribute,
      score: scoreNum
    });
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
