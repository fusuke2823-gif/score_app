const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { optimizeUrl } = require('../utils/cloudinary');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         s.id, s.video_url AS youtube_url, s.approved_score, s.approved_image_url,
         s.attribute, s.updated_at, s.is_anonymous,
         e.id AS event_id, e.name AS event_name, e.event_number,
         u.id AS user_id, u.username,
         gi.image_url AS equipped_icon_url, gi.rarity AS equipped_icon_rarity
       FROM scores s
       JOIN events e ON e.id = s.event_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN gacha_icons gi ON gi.id = u.equipped_icon_id
       WHERE s.video_url IS NOT NULL
         AND s.approved_score IS NOT NULL
         AND s.ranking_scope = 'public'
       ORDER BY s.updated_at DESC
       LIMIT 100`
    );
    res.json(result.rows.map(r => ({
      ...r,
      approved_image_url: optimizeUrl(r.approved_image_url),
      equipped_icon_url: optimizeUrl(r.equipped_icon_url),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
