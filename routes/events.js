const express = require('express');
const router = express.Router();
const pool = require('../db/index');

// 全イベント一覧（公開：is_active=trueのみ）
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM events WHERE is_active = TRUE ORDER BY event_number DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// イベント詳細（敵情報含む）
router.get('/:id', async (req, res) => {
  try {
    const eventResult = await pool.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (eventResult.rows.length === 0)
      return res.status(404).json({ error: 'イベントが見つかりません' });

    const event = eventResult.rows[0];
    const enemiesResult = await pool.query(
      'SELECT * FROM enemies WHERE event_id = $1 ORDER BY order_index',
      [req.params.id]
    );
    const rulesResult = await pool.query(
      'SELECT * FROM event_rules WHERE event_id = $1 ORDER BY order_index',
      [req.params.id]
    );
    res.json({ ...event, enemies: enemiesResult.rows, rules: rulesResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ランキング取得
router.get('/:id/ranking', async (req, res) => {
  const { attributes } = req.query;
  const selectedAttrs = attributes
    ? attributes.split(',').filter(Boolean)
    : ['火', '氷', '雷', '光', '闇', '無'];

  try {
    const result = await pool.query(
      `WITH best_scores AS (
        SELECT DISTINCT ON (s.user_id)
          s.user_id,
          u.username,
          u.oshi_character,
          u.equipped_title_id,
          s.attribute,
          s.approved_score,
          s.approved_image_url
        FROM scores s
        JOIN users u ON s.user_id = u.id
        WHERE s.event_id = $1
          AND s.attribute = ANY($2)
          AND s.approved_score IS NOT NULL
        ORDER BY s.user_id, s.approved_score DESC
      )
      SELECT
        RANK() OVER (ORDER BY bs.approved_score DESC) AS rank,
        bs.user_id,
        bs.username,
        bs.oshi_character,
        t.name AS equipped_title,
        bs.attribute,
        bs.approved_score,
        bs.approved_image_url
      FROM best_scores bs
      LEFT JOIN titles t ON bs.equipped_title_id = t.id
      ORDER BY bs.approved_score DESC`,
      [req.params.id, selectedAttrs]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
