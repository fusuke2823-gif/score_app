require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/events', require('./routes/events'));
app.use('/api/scores', require('./routes/scores'));
app.use('/api/users', require('./routes/users'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/shop', require('./routes/shop'));
app.use('/api/gacha', require('./routes/gacha'));

// 公開設定（バージョン等）
const pool = require('./db/index');
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
