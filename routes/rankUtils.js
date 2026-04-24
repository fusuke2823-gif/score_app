function convertScoreToPoints(score) {
  score = Math.floor(score);
  if (score <= 0) return 0;
  if (score <= 2000000) return Math.floor(score / 20000);
  if (score <= 3000000) return Math.floor(100 + (score - 2000000) / 2500);
  if (score <= 3500000) return Math.floor(500 + (score - 3000000) / 500);
  if (score <= 4000000) return Math.floor(1500 + (score - 3500000) * 3 / 500);
  return Math.floor(4500 + (score - 4000000) * 3 / 500);
}

function convertEncounterScoreToPoints(score) {
  score = Math.floor(score);
  if (score <= 0) return 0;
  if (score <= 100000) return Math.floor(score / 1000);
  if (score <= 140000) return Math.floor(100 + (score - 100000) / 100);
  if (score <= 147000) return Math.floor(500 + (score - 140000) / 7);
  if (score <= 150000) return Math.floor(1500 + (score - 147000) * 3 / 5);
  if (score <= 156000) return Math.floor(3300 + (score - 150000) / 5);
  if (score <= 156300) return Math.floor(4500 + (score - 156000) * 2);
  return Math.floor(5100 + (score - 156300) * 2);
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

    // ベストスコア（全イベントタイプ・複数敵は/1.05補正）
    const bestResult = await client.query(
      `SELECT
         CASE WHEN (SELECT COUNT(*) FROM enemies en WHERE en.event_id = e.id) > 1
           THEN s.approved_score::float / 1.05
           ELSE s.approved_score::float
         END AS corrected_score,
         e.event_type
       FROM scores s
       JOIN events e ON e.id = s.event_id
       WHERE s.user_id = $1
         AND s.approved_score IS NOT NULL
         AND s.ranking_scope IN ('public', 'internal')
         AND e.event_type IN ('score_attack', 'seraph')
         ${maxEventNumber != null ? `AND e.event_number <= ${maxEventNumber}` : ''}
       ORDER BY corrected_score DESC`,
      [userId]
    );
    const bestPt = bestResult.rows.reduce((max, r) => {
      const pt = r.event_type === 'seraph'
        ? convertEncounterScoreToPoints(parseFloat(r.corrected_score))
        : convertScoreToPoints(parseFloat(r.corrected_score));
      return Math.max(max, pt);
    }, 0);

    // 直近3イベントのスコア（全イベントタイプ）
    const recentResult = await client.query(
      `SELECT
         CASE WHEN (SELECT COUNT(*) FROM enemies en WHERE en.event_id = e.id) > 1
           THEN MAX(s.approved_score)::float / 1.05
           ELSE MAX(s.approved_score)::float
         END AS corrected_score,
         e.event_type
       FROM scores s
       JOIN events e ON e.id = s.event_id
       WHERE s.user_id = $1
         AND s.approved_score IS NOT NULL
         AND s.ranking_scope IN ('public', 'internal')
         AND e.event_type IN ('score_attack', 'seraph')
         ${maxEventNumber != null ? `AND e.event_number <= ${maxEventNumber}` : ''}
       GROUP BY e.id, e.event_number, e.event_type
       ORDER BY e.event_number DESC
       LIMIT 3`,
      [userId]
    );
    const rsPt = recentResult.rows.map(r => {
      const score = parseFloat(r.corrected_score);
      return r.event_type === 'seraph'
        ? convertEncounterScoreToPoints(score)
        : convertScoreToPoints(score);
    });

    // recent_avg計算（不足分を補完）
    let recentPt;
    if (rsPt.length === 0) {
      recentPt = 0;
    } else if (rsPt.length === 1) {
      const fill = rsPt[0] * 0.9;
      recentPt = (rsPt[0] + fill + fill) / 3;
    } else if (rsPt.length === 2) {
      const fill = ((rsPt[0] + rsPt[1]) / 2) * 0.9;
      recentPt = (rsPt[0] + rsPt[1] + fill) / 3;
    } else {
      recentPt = (rsPt[0] + rsPt[1] + rsPt[2]) / 3;
    }

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

module.exports = { convertScoreToPoints, convertEncounterScoreToPoints, updateUserRanks };
