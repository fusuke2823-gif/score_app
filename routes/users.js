const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { optionalAuth } = require('../middleware/auth');
const { optimizeUrl } = require('../utils/cloudinary');
const { ptForEventType } = require('./rankUtils');

const HISTORY_EVENT_TYPES = ['score_attack', 'seraph', 'score_attack_ex'];
const HISTORY_RECENT_N = 5;

// 直近N回のpt推移の向き（傾きを平均ptに対する割合で判定）。ptそのものは返さない
function historyTrend(pts) {
  const recent = pts.slice(-HISTORY_RECENT_N);
  if (recent.length < 3) return null;
  const n = recent.length, mx = (n - 1) / 2, my = recent.reduce((a, b) => a + b, 0) / n;
  const slope = recent.reduce((s, y, i) => s + (i - mx) * (y - my), 0) / recent.reduce((s, _, i) => s + (i - mx) ** 2, 0);
  const change = my > 0 ? slope * (n - 1) / my : 0;
  return change > 0.05 ? 'up' : change < -0.05 ? 'down' : 'flat';
}

// レートランキング（X/Ex/Legend ユーザー、管理者はSランクも閲覧可）
router.get('/rate-ranking', optionalAuth, async (req, res) => {
  const { scope } = req.query;
  const isInternal = scope === 'internal';
  if (isInternal && (!req.user || !req.user.is_internal)) {
    return res.status(403).json({ error: '内部ユーザーのみ閲覧できます' });
  }
  const isAdmin = !!(req.user && req.user.role === 'admin');
  try {
    const scopeFilter = isInternal ? 'AND u.is_internal = TRUE' : '';
    const ranksFilter = isAdmin ? "('S','X','Ex','Legend')" : "('X','Ex','Legend')";
    const result = await pool.query(
      `SELECT u.id, u.username, u.comp_rank, u.x_rate, u.s_rate,
              CASE WHEN u.comp_rank = 'Ex' THEN
                (SELECT COUNT(*)+1 FROM users u2 WHERE u2.comp_rank IN ('Ex','Legend') AND u2.x_rate > u.x_rate)
              ELSE NULL END AS ex_rank,
              CASE WHEN u.x_rate >= 2000 THEN
                (SELECT COUNT(*)+1 FROM users u2 WHERE u2.x_rate >= 2000 AND u2.x_rate > u.x_rate)
              ELSE NULL END AS legend_rank,
              gi.image_url AS equipped_icon_url,
              gi.rarity AS equipped_icon_rarity,
              f.css_class AS equipped_frame
       FROM users u
       LEFT JOIN gacha_icons gi ON u.equipped_icon_id = gi.id
       LEFT JOIN frames f ON u.equipped_frame_id = f.id
       WHERE u.comp_rank IN ${ranksFilter} ${scopeFilter}
       ORDER BY (CASE WHEN u.comp_rank = 'S' THEN u.s_rate ELSE u.x_rate + 1000 END) DESC NULLS LAST`
    );
    res.json(result.rows.map(r => ({ ...r, equipped_icon_url: optimizeUrl(r.equipped_icon_url) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 戦績グラフ用：初参加の回から、終了済みの最新の回までの各回ベストと順位。
// pt換算は非公開のため、グラフの高さはユーザー内で0〜1に正規化した値(y)だけを返す
router.get('/:id/history', async (req, res) => {
  try {
    const [eventsResult, bestResult, rankResult] = await Promise.all([
      pool.query(
        `SELECT id, event_number, name, event_type, COALESCE(display_type, event_type) AS display_type,
                COALESCE(score_multiplier, 1.0)::float AS score_multiplier
         FROM events
         WHERE is_active = TRUE AND event_type = ANY($1) AND exclude_from_history = FALSE
           -- 開催中（受付終了日時が未設定・未到来）の回は結果が確定していないので含めない
           AND submission_end IS NOT NULL AND submission_end < NOW()
         ORDER BY event_number ASC`,
        [HISTORY_EVENT_TYPES]
      ),
      pool.query(
        `SELECT DISTINCT ON (event_id) event_id, attribute, approved_score::float AS score
         FROM scores
         WHERE user_id = $1 AND approved_score IS NOT NULL
         ORDER BY event_id, approved_score DESC`,
        [req.params.id]
      ),
      // ユーザーページの「外部順位」と同じ基準（公開ランキングの全属性順位）
      pool.query(
        `WITH event_ranks AS (
           SELECT s.event_id, s.user_id,
             RANK() OVER (PARTITION BY s.event_id ORDER BY MAX(s.approved_score) DESC) AS rank
           FROM scores s
           WHERE s.approved_score IS NOT NULL AND s.ranking_scope IN ('public', 'external')
           GROUP BY s.event_id, s.user_id
         )
         SELECT event_id, rank::int FROM event_ranks WHERE user_id = $1`,
        [req.params.id]
      ),
    ]);
    const bestMap = new Map(bestResult.rows.map(r => [r.event_id, r]));
    const rankMap = new Map(rankResult.rows.map(r => [r.event_id, r.rank]));

    const firstIdx = eventsResult.rows.findIndex(e => bestMap.has(e.id));
    if (firstIdx === -1) return res.json({ events: [], summary: null });

    const rows = eventsResult.rows.slice(firstIdx).map(e => {
      const best = bestMap.get(e.id);
      return {
        // 点の形・ラベルは表示上の種類、ptの換算は計算用の種類（event_type）で行う
        event_id: e.id, event_number: e.event_number, name: e.name, event_type: e.display_type,
        joined: !!best,
        attribute: best ? best.attribute : null,
        score: best ? best.score : null,
        rank: rankMap.get(e.id) || null,
        pt: best ? ptForEventType(e.event_type, best.score * e.score_multiplier) : null,
      };
    });

    const joined = rows.filter(r => r.joined);
    const pts = joined.map(r => r.pt);
    const minPt = Math.min(...pts), maxPt = Math.max(...pts);
    const recentRanks = joined.map(r => r.rank).filter(r => r != null).slice(-HISTORY_RECENT_N);
    const allRanks = joined.map(r => r.rank).filter(r => r != null);

    res.json({
      events: rows.map(({ pt, ...r }) => ({
        ...r,
        y: r.joined ? (maxPt > minPt ? (pt - minPt) / (maxPt - minPt) : 0.5) : null,
      })),
      summary: {
        joined_count: joined.length,
        recent_avg_rank: recentRanks.length ? recentRanks.reduce((a, b) => a + b, 0) / recentRanks.length : null,
        recent_rank_count: recentRanks.length,
        best_rank: allRanks.length ? Math.min(...allRanks) : null,
        trend: historyTrend(pts),
      },
    });
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
              u.is_internal,
              u.comp_rank, u.rank_points, u.s_rate, u.x_rate, u.twitter_username, u.youtube_channel,
              CASE WHEN u.comp_rank = 'Ex' THEN
                (SELECT COUNT(*) + 1 FROM users u2 WHERE u2.comp_rank IN ('Ex','Legend') AND u2.x_rate > u.x_rate)
              ELSE NULL END AS ex_rank,
              CASE WHEN u.x_rate >= 2000 THEN
                (SELECT COUNT(*) + 1 FROM users u2 WHERE u2.x_rate >= 2000 AND u2.x_rate > u.x_rate)
              ELSE NULL END AS legend_rank,
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

    // 内部順位 ― 閲覧者・対象者ともに内部ユーザーの場合のみ計算
    let intRankMap = null, intAttrRankMap = null;
    if (viewerIsInternal && user.is_internal) {
      const intRankResult = await pool.query(
        `WITH event_ranks AS (
           SELECT s.event_id, s.user_id,
             RANK() OVER (PARTITION BY s.event_id ORDER BY MAX(s.approved_score) DESC) AS rank
           FROM scores s
           JOIN users u ON u.id = s.user_id
           WHERE s.approved_score IS NOT NULL AND u.is_internal = TRUE
           GROUP BY s.event_id, s.user_id
         )
         SELECT event_id, rank FROM event_ranks WHERE user_id = $1`,
        [req.params.id]
      );
      intRankMap = {};
      intRankResult.rows.forEach(r => { intRankMap[r.event_id] = r.rank; });

      const intAttrRankResult = await pool.query(
        `WITH attr_ranks AS (
           SELECT s.event_id, s.attribute, s.user_id,
             RANK() OVER (PARTITION BY s.event_id, s.attribute ORDER BY s.approved_score DESC) AS rank
           FROM scores s
           JOIN users u ON u.id = s.user_id
           WHERE s.approved_score IS NOT NULL AND u.is_internal = TRUE
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
