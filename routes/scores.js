const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const pool = require('../db/index');
const { authenticateToken } = require('../middleware/auth');
const { sendScoreNotification } = require('../utils/mailer');
const { extractScoreResult, isAiCheckEnabled } = require('../utils/gemini');
const { approveScoreRow } = require('./rankUtils');

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
const EVENT_TYPE_LABEL = { score_attack: 'スコアアタック', score_attack_ex: 'スコアアタックEX', seraph: '遭遇戦', unknown: '不明' };

// multerエラーをJSONで返す
router.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE')
    return res.status(400).json({ error: '画像ファイルは10MB以内にしてください' });
  next(err);
});

// スコア投稿
router.post('/', authenticateToken, (req, res, next) => {
  upload.single('image')(req, res, err => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE')
        return res.status(400).json({ error: '画像ファイルは10MB以内にしてください' });
      return res.status(400).json({ error: 'ファイルのアップロードに失敗しました' });
    }
    next();
  });
}, async (req, res) => {
  const { event_id, attribute, score, is_anonymous, ranking_scope, youtube_url } = req.body;

  if (!event_id || !attribute || score === undefined)
    return res.status(400).json({ error: '必須項目が不足しています' });
  if (!req.file)
    return res.status(400).json({ error: 'リザルト画像を添付してください' });
  if (!VALID_ATTRIBUTES.includes(attribute))
    return res.status(400).json({ error: '無効な属性です' });

  const scoreNum = parseInt(score);
  if (isNaN(scoreNum) || scoreNum < 0)
    return res.status(400).json({ error: '無効なスコアです' });

  const ytUrl = youtube_url ? youtube_url.trim() : null;
  if (ytUrl && !/^https?:\/\/(www\.)?(youtube\.com\/(watch|shorts|live)|youtu\.be\/)/.test(ytUrl))
    return res.status(400).json({ error: 'YouTubeのURLのみ入力できます' });
  const ytScore = ytUrl ? parseInt(score) : null;

  try {
    // 投稿期間チェック
    const eventResult = await pool.query('SELECT name, submission_start, submission_end, event_type FROM events WHERE id = $1', [event_id]);
    if (eventResult.rows.length === 0)
      return res.status(404).json({ error: 'イベントが見つかりません' });
    const { submission_start, submission_end, event_type } = eventResult.rows[0];
    const now = new Date();
    if (submission_start && now < new Date(submission_start))
      return res.status(403).json({ error: 'まだ投稿期間が始まっていません' });
    if (submission_end && now > new Date(submission_end))
      return res.status(403).json({ error: '投稿期間が終了しています' });

    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: 'hbr-ranking/results', resource_type: 'image', quality: 'auto:good', fetch_format: 'auto', width: 1080, crop: 'limit' }, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        })
        .end(req.file.buffer);
    });
    const imageUrl = uploadResult.secure_url;

    const userResult = await pool.query('SELECT is_internal FROM users WHERE id = $1', [req.user.id]);
    const isInternal = userResult.rows[0]?.is_internal ?? false;
    // 外部ユーザーは常に 'external'（内部ランキングに入らない）
    const scopeVal = !isInternal ? 'external' : (ranking_scope === 'public' ? 'public' : 'internal');

    // AIによる画像読み取りチェック（結果に関わらず投稿処理自体は続行する）
    let aiExtractedScore = null;
    let aiMatch = null;
    let aiNote = null;
    let autoApprove = false;
    if (await isAiCheckEnabled()) {
      const ai = await extractScoreResult(req.file.buffer, req.file.mimetype);
      if (ai.ok && ai.readable) {
        aiExtractedScore = ai.score;
        const scoreMatches = ai.score === scoreNum;
        const typeMatches = ai.eventTypeGuess === event_type;
        aiMatch = scoreMatches && typeMatches;
        if (!scoreMatches) {
          aiNote = `AI読み取り値: ${ai.score.toLocaleString()}(入力値と不一致)`;
        } else if (!typeMatches) {
          aiNote = `画面の種別(${EVENT_TYPE_LABEL[ai.eventTypeGuess] || ai.eventTypeGuess})と投稿先(${EVENT_TYPE_LABEL[event_type] || event_type})が一致しません`;
        }
        if (aiMatch) {
          const dup = await pool.query(
            'SELECT 1 FROM scores WHERE event_id = $1 AND attribute = $2 AND approved_score = $3 AND user_id != $4 LIMIT 1',
            [event_id, attribute, scoreNum, req.user.id]
          );
          if (dup.rows.length === 0) autoApprove = true;
          else aiNote = '既存の承認済みスコアと数値が重複しているため自動承認をスキップしました';
        }
      } else if (ai.ok && !ai.readable) {
        aiNote = 'AI読み取り不可(手動確認してください)';
      }
      // ai.ok === false（APIキー未設定・タイムアウト・エラー等）の場合は無言でスキップし、従来通り手動承認へ
    }

    const client = await pool.connect();
    let scoreRow;
    let message;
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO scores (user_id, event_id, attribute, pending_score, pending_image_url, status, updated_at, is_anonymous, ranking_scope, pending_youtube_url, pending_youtube_score, ai_extracted_score, ai_match, ai_note)
         VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (user_id, event_id, attribute) DO UPDATE SET
           pending_score = $4,
           pending_image_url = COALESCE($5, scores.pending_image_url),
           status = 'pending',
           is_anonymous = $6,
           ranking_scope = $7,
           pending_youtube_url = $8,
           pending_youtube_score = $9,
           ai_extracted_score = $10,
           ai_match = $11,
           ai_note = $12,
           updated_at = NOW()
         RETURNING *`,
        [req.user.id, event_id, attribute, scoreNum, imageUrl, (event_type === 'seraph' ? scoreNum <= 139999 : event_type === 'score_attack_ex' ? scoreNum <= 1499999 : scoreNum <= 3299999) && (is_anonymous === 'true' || is_anonymous === true), scopeVal, ytUrl, ytScore, aiExtractedScore, aiMatch, aiNote]
      );
      scoreRow = inserted.rows[0];

      if (autoApprove) {
        const { score } = await approveScoreRow(client, scoreRow.id, { adminNote: 'AI自動承認' });
        scoreRow = score;
        message = 'AIがリザルト画像を確認し、自動承認しました。';
      } else {
        message = 'スコアを投稿しました。管理者の承認をお待ちください。';
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ message, score: scoreRow });

    // メール通知（非同期・失敗してもレスポンスに影響しない。自動承認済みの場合は通知不要）
    if (!autoApprove) {
      sendScoreNotification({
        username: req.user.username,
        eventName: eventResult.rows[0].name,
        attribute,
        score: scoreNum
      });
    }
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
