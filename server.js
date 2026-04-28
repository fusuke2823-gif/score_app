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
