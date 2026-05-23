require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// シンプルなレート制限（15分間に20回まで）
const _rateLimitStore = new Map();
function authLimiter(req, res, next) {
  const key = req.ip;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const max = 20;
  const entry = _rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
  entry.count++;
  _rateLimitStore.set(key, entry);
  if (entry.count > max) return res.status(429).json({ error: 'しばらくしてから再試行してください' });
  next();
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/events', require('./routes/events'));
app.use('/api/scores', require('./routes/scores'));
app.use('/api/users', require('./routes/users'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/shop', require('./routes/shop'));
app.use('/api/gacha', require('./routes/gacha'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/videos', require('./routes/videos'));
app.use('/api/my-videos', require('./routes/my-videos'));
app.use('/api/charts', require('./routes/charts'));
app.use('/api/analytics', require('./routes/analytics'));

// Google Client ID 公開
app.get('/api/auth/google/client-id', (req, res) => {
  res.json({ client_id: process.env.GOOGLE_CLIENT_ID || '' });
});

// 公開設定（バージョン等）
const pool = require('./db/index');
const { fetchUsage } = require('./utils/cloudinary');
app.get('/api/image-mode', async (req, res) => {
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key='cloudinary_bw_limit'");
    const limitPct = r.rows[0]?.value != null ? Number(r.rows[0].value) : null;
    if (limitPct === null) return res.json({ showImages: true });
    const usage = await fetchUsage();
    const bwPct = usage.bandwidth?.used_percent || 0;
    res.json({ showImages: bwPct < limitPct, bwPct, limitPct });
  } catch {
    res.json({ showImages: true });
  }
});

app.get('/api/version', async (req, res) => {
  try {
    const result = await pool.query("SELECT value FROM settings WHERE key = 'app_version'");
    res.json({ version: result.rows[0]?.value || '4.00.65' });
  } catch {
    res.json({ version: '4.00.65' });
  }
});

// 結果画像シェア
const cloudinary = require('cloudinary').v2;
cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
const { authenticateToken: _authToken } = require('./middleware/auth');

app.post('/api/share-image', _authToken, async (req, res) => {
  const { dataUrl, eventName } = req.body;
  if (!dataUrl || !eventName) return res.status(400).json({ error: 'パラメータ不足' });
  try {
    const uploadRes = await cloudinary.uploader.upload(dataUrl, { folder: 'hbr-ranking/share', resource_type: 'image' });
    const id = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    await pool.query(
      'INSERT INTO share_images (id, image_url, event_name) VALUES ($1, $2, $3)',
      [id, uploadRes.secure_url, eventName]
    );
    res.json({ id, url: `/s/${id}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'アップロード失敗' });
  }
});

app.get('/s/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM share_images WHERE id = $1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).send('Not found');
    const { image_url, event_name } = r.rows[0];
    const title = `${event_name} - ヘブバン ランクボード`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<meta property="og:type" content="website">
<meta property="og:title" content="${title.replace(/"/g, '&quot;')}">
<meta property="og:image" content="${image_url}">
<meta property="og:description" content="ヘブバン ランクボードで生成した結果画像">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}">
<meta name="twitter:image" content="${image_url}">
<title>${title.replace(/</g, '&lt;')}</title>
</head><body style="margin:0;background:#0d0d1a;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh">
<img src="${image_url}" style="max-width:100%;border-radius:8px">
<p style="color:#aaa;font-size:0.85rem;margin-top:12px"><a href="/" style="color:#e8d070">ヘブバン ランクボード</a></p>
</body></html>`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
});

// DB初期化してからサーバー起動
require('./db/init')()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`サーバー起動: http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('DB初期化失敗:', err);
    process.exit(1);
  });
