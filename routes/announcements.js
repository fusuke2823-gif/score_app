const express = require('express');
const router = express.Router();
const pool = require('../db/index');

// お知らせ一覧（有効なもののみ、新しい順）
router.get('/', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id, title, body, link_url, image_url, created_at FROM announcements WHERE is_active = TRUE ORDER BY created_at DESC'
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
