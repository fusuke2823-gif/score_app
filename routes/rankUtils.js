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
  if (score <= 155000) return Math.floor(3300 + (score - 150000) * 6 / 25);
  if (score <= 156000) return Math.floor(4500 + (score - 155000) * 3 / 5);
  if (score <= 156250) return Math.floor(5100 + (score - 156000) * 2.4);
  return Math.floor(5700 + (score - 156250) * 2);
}

// スコアタEX用スコア→pt変換（130万=1500pt, 180万=3300pt, 230万=5700pt を結ぶ区分線形）
function convertExScoreToPoints(score) {
  score = Math.floor(score);
  if (score <= 0) return 0;
  if (score <= 1300000) return Math.floor(score * 1500 / 1300000);
  if (score <= 1800000) return Math.floor(1500 + (score - 1300000) * 1800 / 500000);
  if (score <= 2300000) return Math.floor(3300 + (score - 1800000) * 2400 / 500000);
  return Math.floor(5700 + (score - 2300000) * 2400 / 500000);
}

function ptForEventType(eventType, score) {
  if (eventType === 'seraph') return convertEncounterScoreToPoints(score);
  if (eventType === 'score_attack_ex') return convertExScoreToPoints(score);
  return convertScoreToPoints(score);
}

// Xレート用pt→rate変換（350万=0, 380万=1500, 以降は緩やかな係数）
function rateForXPt(pt) {
  if (pt < 3300) return (pt - 1500) * 0.833;
  return 1500 + (pt - 3300) * 0.25;
}

// 種別群（配列）ごとの「直近N回」平均pt（参加分のみの平均を、未参加1回につき-10%で減衰）
// eventTypes は複数種別を混ぜて集計できるよう配列で受け取る（各行のptは行ごとのevent_typeで変換）
async function getRecentTypesAvgPt(client, userId, eventTypes, windowSize, maxEventNumber) {
  const recentResult = await client.query(
    `SELECT e.event_number, e.event_type, e.score_multiplier, MAX(s.approved_score) AS best_score
     FROM (
       SELECT id, event_number, event_type, score_multiplier
       FROM events
       WHERE event_type = ANY($1)
       ${maxEventNumber != null ? `AND event_number <= ${maxEventNumber}` : ''}
       ORDER BY event_number DESC
       LIMIT ${windowSize}
     ) e
     LEFT JOIN scores s ON s.event_id = e.id
       AND s.user_id = $2
       AND s.approved_score IS NOT NULL
       AND s.ranking_scope IN ('public', 'internal', 'external')
     GROUP BY e.event_number, e.event_type, e.score_multiplier
     ORDER BY e.event_number DESC`,
    [eventTypes, userId]
  );

  const pts = recentResult.rows.map(r => {
    if (r.best_score == null) return null;
    const score = parseFloat(r.best_score) * parseFloat(r.score_multiplier || 1.0);
    return ptForEventType(r.event_type, score);
  });

  const participated = pts.filter(p => p !== null);
  if (participated.length === 0 || recentResult.rows.length === 0) return 0;
  const avg = participated.reduce((a, b) => a + b, 0) / participated.length;
  const missed = recentResult.rows.length - participated.length;
  const penalty = Math.max(0, 1 - missed * 0.1); // 未参加1回→×0.9, 2回→×0.8, 3回→×0.7
  return avg * penalty;
}

// 種別ごとの「直近参加時のpt × 0.9^(その後の未参加回数)」
// 一度も参加なしの場合は fallbackPt を返す（デフォルト0）
async function getDecayedModePt(client, userId, eventType, maxEventNumber, fallbackPt = 0) {
  const lastResult = await client.query(
    `SELECT e.event_number, s.approved_score::float * COALESCE(e.score_multiplier, 1.0) AS corrected_score
     FROM scores s
     JOIN events e ON e.id = s.event_id
     WHERE s.user_id = $1
       AND s.approved_score IS NOT NULL
       AND s.ranking_scope IN ('public', 'internal', 'external')
       AND e.event_type = $2
       ${maxEventNumber != null ? `AND e.event_number <= ${maxEventNumber}` : ''}
     ORDER BY e.event_number DESC
     LIMIT 1`,
    [userId, eventType]
  );
  if (lastResult.rows.length === 0) return fallbackPt;

  const { event_number, corrected_score } = lastResult.rows[0];
  const pt = ptForEventType(eventType, parseFloat(corrected_score));

  const missedResult = await client.query(
    `SELECT COUNT(*)::int AS cnt FROM events
     WHERE event_type = $1 AND event_number > $2
     ${maxEventNumber != null ? `AND event_number <= ${maxEventNumber}` : ''}`,
    [eventType, event_number]
  );
  const missed = missedResult.rows[0].cnt;
  return pt * Math.pow(0.9, missed);
}

// スコアタ+遭遇戦+EX 全プールでの歴代ベストpt
async function getBestPtAllTypes(client, userId, maxEventNumber) {
  const bestResult = await client.query(
    `SELECT
       s.approved_score::float * COALESCE(e.score_multiplier, 1.0) AS corrected_score,
       e.event_type
     FROM scores s
     JOIN events e ON e.id = s.event_id
     WHERE s.user_id = $1
       AND s.approved_score IS NOT NULL
       AND s.ranking_scope IN ('public', 'internal', 'external')
       AND e.event_type IN ('score_attack', 'seraph', 'score_attack_ex')
       ${maxEventNumber != null ? `AND e.event_number <= ${maxEventNumber}` : ''}
     ORDER BY corrected_score DESC`,
    [userId]
  );
  return bestResult.rows.reduce((max, r) => {
    const pt = ptForEventType(r.event_type, parseFloat(r.corrected_score));
    return Math.max(max, pt);
  }, 0);
}

// Xレート用の合成pt = ベスト40% + スコアタ・遭遇戦混合の直近4回平均40% + EX直近(減衰)20%
async function getCombinedXPt(client, userId, maxEventNumber) {
  const [newBestPt, saSeraphRecent4, exDecayed] = await Promise.all([
    getBestPtAllTypes(client, userId, maxEventNumber),
    getRecentTypesAvgPt(client, userId, ['score_attack', 'seraph'], 4, maxEventNumber),
    getDecayedModePt(client, userId, 'score_attack_ex', maxEventNumber),
  ]);
  return newBestPt * 0.40 + saSeraphRecent4 * 0.40 + exDecayed * 0.20;
}

async function updateUserRanks(client, userIds, { maxEventNumber = null } = {}) {
  for (const userId of userIds) {
    const userRow = (await client.query(
      'SELECT comp_rank, rank_points, s_rate, x_rate FROM users WHERE id=$1',
      [userId]
    )).rows[0];
    if (!userRow) continue;

    const { rank_points } = userRow;

    // ベストスコア（A→S昇格判定用：スコアアタック・遭遇戦のみ、複数敵は/1.05補正）
    const bestResult = await client.query(
      `SELECT
         s.approved_score::float * COALESCE(e.score_multiplier, 1.0) AS corrected_score,
         e.event_type
       FROM scores s
       JOIN events e ON e.id = s.event_id
       WHERE s.user_id = $1
         AND s.approved_score IS NOT NULL
         AND s.ranking_scope IN ('public', 'internal', 'external')
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

    // ランク進行
    let newRank = userRow.comp_rank || 'C';
    let newSRate = userRow.s_rate;
    let newXRate = userRow.x_rate;

    // C→B→A→S（降格なし）
    if (newRank === 'C' && rank_points >= 400) newRank = 'B';
    if (newRank === 'B' && rank_points >= 1000) newRank = 'A';
    if (newRank === 'A' && rank_points >= 2000 && bestPt >= 500) newRank = 'S';

    // S/X/Ex/Legendレート計算（SレートもXレートも同じ合成ptから算出）
    if (['S', 'X', 'Ex', 'Legend'].includes(newRank)) {
      // 合成pt（ベスト40%+スコアタ・遭遇戦混合の直近4回平均40%+EX直近減衰20%）
      const combinedXPt = await getCombinedXPt(client, userId, maxEventNumber);
      const sRate = combinedXPt - 500;

      if (newRank === 'S') {
        newSRate = sRate;
        if (sRate >= 1000) {
          newXRate = rateForXPt(combinedXPt);
          if (newXRate < 0) {
            newXRate = null;
          } else {
            newRank = newXRate >= 1500 ? 'Ex' : 'X';
          }
        }
      } else {
        // X or Ex or Legend（一旦X/Exまで戻し、Legendへの再昇格はsyncLegendRanksでまとめて判定する）
        newXRate = rateForXPt(combinedXPt);
        newSRate = Math.min(sRate, 1000);

        if (newXRate < 0) {
          newRank = 'S';
          newSRate = sRate;
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

  await syncLegendRanks(client);
}

// Legendランクの基準
const LEGEND_MIN_RATE = 2000;
const LEGEND_TOP_N = 10;

// Xレート2000以上のユーザーを対象に、上位10人をLegendへ昇格・それ以外(元Legend含む)はExへ差し戻す
async function syncLegendRanks(client) {
  const { rows } = await client.query(
    `SELECT id, comp_rank, x_rate FROM users
     WHERE x_rate >= $1 OR comp_rank = 'Legend'
     ORDER BY x_rate DESC NULLS LAST`,
    [LEGEND_MIN_RATE]
  );
  for (let i = 0; i < rows.length; i++) {
    const u = rows[i];
    const shouldBeLegend = i < LEGEND_TOP_N && u.x_rate >= LEGEND_MIN_RATE;
    const newRank = shouldBeLegend ? 'Legend' : (u.comp_rank === 'Legend' ? 'Ex' : u.comp_rank);
    if (newRank !== u.comp_rank) {
      await client.query('UPDATE users SET comp_rank=$1 WHERE id=$2', [newRank, u.id]);
    }
  }
}

module.exports = {
  convertScoreToPoints,
  convertEncounterScoreToPoints,
  convertExScoreToPoints,
  ptForEventType,
  rateForXPt,
  getRecentTypesAvgPt,
  getDecayedModePt,
  getBestPtAllTypes,
  getCombinedXPt,
  updateUserRanks,
  syncLegendRanks,
};
