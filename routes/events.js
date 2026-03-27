const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { authenticateToken } = require('../middleware/auth');

// 全イベント一覧（公開：is_active=trueのみ）
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*,
        (SELECT en.image_url FROM enemies en WHERE en.event_id = e.id ORDER BY en.order_index LIMIT 1) AS first_enemy_image
       FROM events e WHERE e.is_active = TRUE ORDER BY e.event_number DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 順位ポイント設定（公開用）― /:id より前に定義
router.get('/rank-pts', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('rank_pts_1','rank_pts_2','rank_pts_3','rank_pts_4','rank_pts_5','rank_pts_6','rank_pts_7','rank_pts_8','rank_pts_9','rank_pts_10','rank_pts_11_15','rank_pts_16_20','rank_pts_21_25','rank_pts_26_30','rank_pts_31plus')"
    );
    const rp = {};
    result.rows.forEach(r => { rp[r.key] = parseInt(r.value); });
    res.json(rp);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 最近の中間配布一覧（通知用・7日以内・自分の順位＋配布pt付き）― /:id より前に定義
router.get('/interim-distributions/recent', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.id, d.event_id, d.distributed_at,
              e.name AS event_name, e.event_number,
              (SELECT (regexp_match(ph.reason, '(\\d+)位'))[1]::integer
               FROM point_history ph
               WHERE ph.user_id = $1
                 AND ph.created_at BETWEEN d.distributed_at - INTERVAL '5 minutes'
                                       AND d.distributed_at + INTERVAL '5 minutes'
                 AND ph.reason LIKE '%（中間配布）%'
               LIMIT 1) AS user_rank,
              (SELECT ph.amount
               FROM point_history ph
               WHERE ph.user_id = $1
                 AND ph.created_at BETWEEN d.distributed_at - INTERVAL '5 minutes'
                                       AND d.distributed_at + INTERVAL '5 minutes'
                 AND ph.reason LIKE '%（中間配布）%'
               LIMIT 1) AS user_pts
       FROM event_interim_distributions d
       JOIN events e ON e.id = d.event_id
       WHERE d.distributed_at > NOW() - INTERVAL '7 days'
       ORDER BY d.distributed_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 最近の最終配布一覧（通知用・7日以内・自分の順位＋配布pt付き）― /:id より前に定義
router.get('/final-distributions/recent', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id AS event_id, e.points_distributed_at AS distributed_at,
              e.name AS event_name, e.event_number,
              (SELECT (regexp_match(ph.reason, '(\\d+)位'))[1]::integer
               FROM point_history ph
               WHERE ph.user_id = $1
                 AND ph.created_at BETWEEN e.points_distributed_at - INTERVAL '5 minutes'
                                       AND e.points_distributed_at + INTERVAL '5 minutes'
                 AND ph.reason NOT LIKE '%（中間配布）%'
               LIMIT 1) AS user_rank,
              (SELECT ph.amount
               FROM point_history ph
               WHERE ph.user_id = $1
                 AND ph.created_at BETWEEN e.points_distributed_at - INTERVAL '5 minutes'
                                       AND e.points_distributed_at + INTERVAL '5 minutes'
                 AND ph.reason NOT LIKE '%（中間配布）%'
               LIMIT 1) AS user_pts
       FROM events e
       WHERE e.points_distributed = TRUE
         AND e.points_distributed_at IS NOT NULL
         AND e.points_distributed_at > NOW() - INTERVAL '7 days'
       ORDER BY e.points_distributed_at DESC`,
      [req.user.id]
    );
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
          u.equipped_frame_id,
          u.equipped_icon_id,
          s.attribute,
          s.approved_score,
          s.approved_image_url,
          s.is_anonymous
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
        t.description AS equipped_title_desc,
        f.css_class AS equipped_frame,
        gi.image_url AS equipped_icon_url,
        gi.rarity AS equipped_icon_rarity,
        bs.attribute,
        bs.approved_score,
        bs.approved_image_url,
        bs.is_anonymous
      FROM best_scores bs
      LEFT JOIN titles t ON bs.equipped_title_id = t.id
      LEFT JOIN frames f ON bs.equipped_frame_id = f.id
      LEFT JOIN gacha_icons gi ON bs.equipped_icon_id = gi.id
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
