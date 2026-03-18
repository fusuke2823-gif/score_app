const express = require('express');
const router = express.Router();
const pool = require('../db/index');

// ユーザー詳細（承認済みスコア一覧付き）
router.get('/:id', async (req, res) => {
  try {
    const userResult = await pool.query(
      'SELECT id, username, oshi_character, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    if (userResult.rows.length === 0)
      return res.status(404).json({ error: 'ユーザーが見つかりません' });

    const user = userResult.rows[0];

    // 各イベント・各属性の承認済みスコア
    const scoresResult = await pool.query(
      `SELECT
         s.event_id,
         e.event_number,
         e.name AS event_name,
         s.attribute,
         s.approved_score,
         s.approved_image_url
       FROM scores s
       JOIN events e ON s.event_id = e.id
       WHERE s.user_id = $1
         AND s.approved_score IS NOT NULL
       ORDER BY e.event_number DESC, s.approved_score DESC`,
      [req.params.id]
    );

    // イベントごとに全属性選択時のランキング順位を計算
    const rankResult = await pool.query(
      `WITH all_events AS (
         SELECT DISTINCT event_id FROM scores WHERE approved_score IS NOT NULL
       ),
       user_best AS (
         SELECT
           event_id,
           MAX(approved_score) AS best_score
         FROM scores
         WHERE user_id = $1 AND approved_score IS NOT NULL
         GROUP BY event_id
       ),
       event_ranks AS (
         SELECT
           s.event_id,
           s.user_id,
           MAX(s.approved_score) AS best_score,
           RANK() OVER (PARTITION BY s.event_id ORDER BY MAX(s.approved_score) DESC) AS rank
         FROM scores s
         WHERE s.approved_score IS NOT NULL
         GROUP BY s.event_id, s.user_id
       )
       SELECT er.event_id, er.rank
       FROM event_ranks er
       WHERE er.user_id = $1`,
      [req.params.id]
    );

    const rankMap = {};
    rankResult.rows.forEach((r) => { rankMap[r.event_id] = r.rank; });

    res.json({ ...user, scores: scoresResult.rows, ranks: rankMap });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
