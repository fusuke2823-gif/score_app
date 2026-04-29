const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { optionalAuth } = require('../middleware/auth');
const { optimizeUrl } = require('../utils/cloudinary');

// レートランキング（X/Ex ユーザー）
router.get('/rate-ranking', optionalAuth, async (req, res) => {
  const { scope } = req.query;
  const isInternal = scope === 'internal';
  if (isInternal && (!req.user || !req.user.is_internal)) {
    return res.status(403).json({ error: '内部ユーザーのみ閲覧できます' });
  }
  try {
    const scopeFilter = isInternal ? 'AND u.is_internal = TRUE' : '';
    const result = await pool.query(
      `SELECT u.id, u.username, u.comp_rank, u.x_rate,
              CASE WHEN u.comp_rank = 'Ex' THEN
                (SELECT COUNT(*)+1 FROM users u2 WHERE u2.comp_rank='Ex' AND u2.x_rate > u.x_rate)
              ELSE NULL END AS ex_rank,
              gi.image_url AS equipped_icon_url,
              gi.rarity AS equipped_icon_rarity,
              f.css_class AS equipped_frame
       FROM users u
       LEFT JOIN gacha_icons gi ON u.equipped_icon_id = gi.id
       LEFT JOIN frames f ON u.equipped_frame_id = f.id
       WHERE u.comp_rank IN ('X','Ex') ${scopeFilter}
       ORDER BY u.x_rate DESC NULLS LAST`
    );
    res.json(result.rows.map(r => ({ ...r, equipped_icon_url: optimizeUrl(r.equipped_icon_url) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ユーザー詳細（承認済みスコア一覧付き）
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const userResult = await pool.query(
      `SELECT u.id, u.username, u.oshi_character, u.created_at, u.equipped_title_id,
              u.comp_rank, u.rank_points, u.s_rate, u.x_rate, u.twitter_username, u.youtube_channel,
              CASE WHEN u.comp_rank = 'Ex' THEN
                (SELECT COUNT(*) + 1 FROM users u2 WHERE u2.comp_rank = 'Ex' AND u2.x_rate > u.x_rate)
              ELSE NULL END AS ex_rank,
              gi.image_url AS equipped_icon_url,
              gi.rarity AS equipped_icon_rarity
       FROM users u
       LEFT JOIN gacha_icons gi ON u.equipped_icon_id = gi.id
       WHERE u.id = $1`,
      [req.params.id]
    );
    if (userResult.rows.length === 0)
      return res.status(404).json({ error: 'ユーザーが見つかりません' });

    const user = userResult.rows[0];

    // 装備中称号
    let equippedTitle = null;
    if (user.equipped_title_id) {
      const titleResult = await pool.query('SELECT name, description FROM titles WHERE id=$1', [user.equipped_title_id]);
      if (titleResult.rows.length > 0) equippedTitle = titleResult.rows[0];
    }

    // 各イベント・各属性の承認済みスコア
    const scoresResult = await pool.query(
      `SELECT
         s.event_id,
         e.event_number,
         e.name AS event_name,
         s.attribute,
         s.approved_score,
         s.approved_image_url,
         s.youtube_url,
         s.youtube_score
       FROM scores s
       JOIN events e ON s.event_id = e.id
       WHERE s.user_id = $1
         AND s.approved_score IS NOT NULL
       ORDER BY e.event_number DESC, s.approved_score DESC`,
      [req.params.id]
    );

    const viewerIsInternal = !!(req.user && req.user.is_internal);

    // 外部順位（ranking_scope='public' or 'external'）
    const extRankResult = await pool.query(
      `WITH event_ranks AS (
         SELECT s.event_id, s.user_id,
           RANK() OVER (PARTITION BY s.event_id ORDER BY MAX(s.approved_score) DESC) AS rank
         FROM scores s
         WHERE s.approved_score IS NOT NULL AND s.ranking_scope IN ('public', 'external')
         GROUP BY s.event_id, s.user_id
       )
       SELECT event_id, rank FROM event_ranks WHERE user_id = $1`,
      [req.params.id]
    );
    const extRankMap = {};
    extRankResult.rows.forEach(r => { extRankMap[r.event_id] = r.rank; });

    const extAttrRankResult = await pool.query(
      `WITH attr_ranks AS (
         SELECT event_id, attribute, user_id,
           RANK() OVER (PARTITION BY event_id, attribute ORDER BY approved_score DESC) AS rank
         FROM scores
         WHERE approved_score IS NOT NULL AND ranking_scope IN ('public', 'external')
       )
       SELECT event_id, attribute, rank FROM attr_ranks WHERE user_id = $1`,
      [req.params.id]
    );
    const extAttrRankMap = {};
    extAttrRankResult.rows.forEach(r => { extAttrRankMap[`${r.event_id}_${r.attribute}`] = r.rank; });

    // 内部順位（全承認済みスコア対象）― 内部ユーザーが閲覧時のみ計算
    let intRankMap = null, intAttrRankMap = null;
    if (viewerIsInternal) {
      const intRankResult = await pool.query(
        `WITH event_ranks AS (
           SELECT s.event_id, s.user_id,
             RANK() OVER (PARTITION BY s.event_id ORDER BY MAX(s.approved_score) DESC) AS rank
           FROM scores s
           WHERE s.approved_score IS NOT NULL
           GROUP BY s.event_id, s.user_id
         )
         SELECT event_id, rank FROM event_ranks WHERE user_id = $1`,
        [req.params.id]
      );
      intRankMap = {};
      intRankResult.rows.forEach(r => { intRankMap[r.event_id] = r.rank; });

      const intAttrRankResult = await pool.query(
        `WITH attr_ranks AS (
           SELECT event_id, attribute, user_id,
             RANK() OVER (PARTITION BY event_id, attribute ORDER BY approved_score DESC) AS rank
           FROM scores
           WHERE approved_score IS NOT NULL
         )
         SELECT event_id, attribute, rank FROM attr_ranks WHERE user_id = $1`,
        [req.params.id]
      );
      intAttrRankMap = {};
      intAttrRankResult.rows.forEach(r => { intAttrRankMap[`${r.event_id}_${r.attribute}`] = r.rank; });
    }

    res.json({
      ...user,
      equipped_icon_url: optimizeUrl(user.equipped_icon_url),
      equipped_title: equippedTitle?.name || null,
      equipped_title_desc: equippedTitle?.description || null,
      scores: scoresResult.rows.map(r => ({ ...r, approved_image_url: optimizeUrl(r.approved_image_url) })),
      ranks: extRankMap,
      attr_ranks: extAttrRankMap,
      ranks_internal: intRankMap,
      attr_ranks_internal: intAttrRankMap,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
