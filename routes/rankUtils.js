function convertScoreToPoints(score) {
  score = Math.floor(score);
  if (score <= 0) return 0;
  if (score <= 2000000) return Math.floor(score / 20000);
  if (score <= 3000000) return Math.floor(100 + (score - 2000000) / 2500);
  if (score <= 3500000) return Math.floor(500 + (score - 3000000) / 500);
  if (score <= 4000000) return Math.floor(1500 + (score - 3500000) * 3 / 500);
  return Math.floor(4500 + (score - 4000000) * 3 / 500);
}

// Xレート用pt→rate変換（350万=0, 380万=1500, 以降は緩やかな係数）
function rateForXPt(pt) {
  if (pt < 3300) return (pt - 1500) * 0.833;
  return 1500 + (pt - 3300) * 0.209;
}

async function updateUserRanks(client, userIds, { maxEventNumber = null } = {}) {
  for (const userId of userIds) {
    const userRow = (await client.query(
      'SELECT comp_rank, rank_points, s_rate, x_rate FROM users WHERE id=$1',
      [userId]
    )).rows[0];
    if (!userRow) continue;

    const { rank_points } = userRow;

    // ベストスコア（スコアアタックのみ・複数敵は/1.05補正）
    const bestResult = await client.query(
      `SELECT
         CASE WHEN (SELECT COUNT(*) FROM enemies en WHERE en.event_id = e.id) > 1
           THEN s.approved_score::float / 1.05
           ELSE s.approved_score::float
         END AS corrected_score
       FROM scores s
       JOIN events e ON e.id = s.event_id
       WHERE s.user_id = $1
         AND s.approved_score IS NOT NULL
         AND s.ranking_scope IN ('public', 'internal')
         AND e.event_type = 'score_attack'
         ${maxEventNumber != null ? `AND e.event_number <= ${maxEventNumber}` : ''}
       ORDER BY corrected_score DESC
       LIMIT 1`,
      [userId]
    );
    const bestScore = bestResult.rows.length > 0 ? parseFloat(bestResult.rows[0].corrected_score) : 0;
    const bestPt = convertScoreToPoints(bestScore);

    // 直近3イベントのスコア（スコアアタックのみ）
    const recentResult = await client.query(
      `SELECT
         CASE WHEN (SELECT COUNT(*) FROM enemies en WHERE en.event_id = e.id) > 1
           THEN MAX(s.approved_score)::float / 1.05
           ELSE MAX(s.approved_score)::float
         END AS corrected_score
       FROM scores s
       JOIN events e ON e.id = s.event_id
       WHERE s.user_id = $1
         AND s.approved_score IS NOT NULL
         AND s.ranking_scope IN ('public', 'internal')
         AND e.event_type = 'score_attack'
         ${maxEventNumber != null ? `AND e.event_number <= ${maxEventNumber}` : ''}
       GROUP BY e.id, e.event_number
       ORDER BY e.event_number DESC
       LIMIT 3`,
      [userId]
    );
    const rs = recentResult.rows.map(r => parseFloat(r.corrected_score));

    // recent_avg計算（不足分を補完）
    let recentAvgScore;
    if (rs.length === 0) {
      recentAvgScore = 0;
    } else if (rs.length === 1) {
      const fill = rs[0] * 0.9;
      recentAvgScore = (rs[0] + fill + fill) / 3;
    } else if (rs.length === 2) {
      const fill = ((rs[0] + rs[1]) / 2) * 0.9;
      recentAvgScore = (rs[0] + rs[1] + fill) / 3;
    } else {
      recentAvgScore = (rs[0] + rs[1] + rs[2]) / 3;
    }
    const recentPt = convertScoreToPoints(recentAvgScore);

    // ランク進行
    let newRank = userRow.comp_rank || 'C';
    let newSRate = userRow.s_rate;
    let newXRate = userRow.x_rate;

    // C→B→A→S（降格なし）
    if (newRank === 'C' && rank_points >= 400) newRank = 'B';
    if (newRank === 'B' && rank_points >= 1000) newRank = 'A';
    if (newRank === 'A' && rank_points >= 2000 && bestPt >= 500) newRank = 'S';

    // S/X/Exレート計算
    if (['S', 'X', 'Ex'].includes(newRank)) {
      const sRate = (bestPt - 500) * 0.7 + (recentPt - 500) * 0.3;

      if (newRank === 'S') {
        newSRate = sRate;
        if (sRate >= 1000) {
          newXRate = rateForXPt(bestPt) * 0.5 + rateForXPt(recentPt) * 0.5;
          newRank = newXRate >= 1500 ? 'Ex' : 'X';
        }
      } else {
        // X or Ex
        newXRate = rateForXPt(bestPt) * 0.5 + rateForXPt(recentPt) * 0.5;
        newSRate = Math.min(sRate, 1000);

        if (newXRate < 0) {
          newRank = 'S';
          newXRate = null;
        } else {
          newRank = newXRate >= 1500 ? 'Ex' : 'X';
        }
      }
    }

    await client.query(
      'UPDATE users SET comp_rank=$1, s_rate=$2, x_rate=$3 WHERE id=$4',
      [newRank, newSRate !== undefined ? newSRate : null, newXRate !== undefined ? newXRate : null, userId]
    );
  }
}

module.exports = { convertScoreToPoints, updateUserRanks };
