// 指定イベントまでのスコアでランク・レートを再計算するスクリプト
// 実行例:
//   node scripts/recalc-ranks-until-event.js 15

require('dotenv').config();
const pool = require('../db/index');
const {
  updateUserRanks,
  ptForEventType,
  getBestPtAllTypes,
  getRecentTypesAvgPt,
  getDecayedModePt,
  getCombinedXPt,
} = require('../routes/rankUtils');

async function getUserScoreDetail(client, userId, maxEventNumber) {
  const { rows: recent } = await client.query(
    `SELECT e.name AS event_name,
            MAX(s.approved_score)::float * COALESCE(e.score_multiplier, 1.0) AS corrected_score,
            e.event_type
     FROM scores s
     JOIN events e ON e.id = s.event_id
     WHERE s.user_id = $1
       AND s.approved_score IS NOT NULL
       AND s.ranking_scope IN ('public', 'internal', 'external')
       AND e.event_type IN ('score_attack', 'seraph', 'score_attack_ex')
       AND e.event_number <= $2
     GROUP BY e.id, e.name, e.event_number, e.event_type
     ORDER BY e.event_number DESC
     LIMIT 4`,
    [userId, maxEventNumber]
  );

  const { rows: best } = await client.query(
    `SELECT e.name AS event_name,
            s.approved_score::float * COALESCE(e.score_multiplier, 1.0) AS corrected_score,
            e.event_type
     FROM scores s
     JOIN events e ON e.id = s.event_id
     WHERE s.user_id = $1
       AND s.approved_score IS NOT NULL
       AND s.ranking_scope IN ('public', 'internal', 'external')
       AND e.event_type IN ('score_attack', 'seraph', 'score_attack_ex')
       AND e.event_number <= $2
     ORDER BY corrected_score DESC
     LIMIT 1`,
    [userId, maxEventNumber]
  );

  const toPt = (row) => ptForEventType(row.event_type, Math.floor(row.corrected_score));

  const [newBestPt, saSeraphRecent4, exDecayed, combinedXPt] = await Promise.all([
    getBestPtAllTypes(client, userId, maxEventNumber),
    getRecentTypesAvgPt(client, userId, ['score_attack', 'seraph'], 4, maxEventNumber),
    getDecayedModePt(client, userId, 'score_attack_ex', maxEventNumber),
    getCombinedXPt(client, userId, maxEventNumber),
  ]);

  return {
    recent: recent.map(r => ({ event_name: r.event_name, score: Math.floor(r.corrected_score), pt: toPt(r) })),
    best: best[0] ? { event_name: best[0].event_name, score: Math.floor(best[0].corrected_score), pt: toPt(best[0]) } : null,
    xBreakdown: { newBestPt, saSeraphRecent4, exDecayed, combinedXPt },
  };
}

async function run() {
  const eventNumber = parseInt(process.argv[2]);

  if (!eventNumber) {
    console.error('使い方: node scripts/recalc-ranks-until-event.js <イベント番号>');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT id, name FROM events WHERE event_number = $1', [eventNumber]);
    if (!rows[0]) { console.error(`イベント番号 ${eventNumber} が見つかりません`); process.exit(1); }
    console.log(`イベント: [${rows[0].id}] ${rows[0].name} (イベント番号 ${eventNumber})`);
    console.log(`→ イベント番号 ${eventNumber} 以前のスコアで全ユーザーのランク・レートを再計算します\n`);

    await client.query('BEGIN');

    const { rows: targets } = await client.query(
      `SELECT id, username, comp_rank, s_rate, x_rate FROM users ORDER BY id`
    );
    console.log(`対象ユーザー: ${targets.length} 人`);

    await updateUserRanks(client, targets.map(r => r.id), { maxEventNumber: eventNumber });

    const { rows: after } = await client.query(
      `SELECT id, username, comp_rank, s_rate, x_rate FROM users WHERE id = ANY($1) ORDER BY id`,
      [targets.map(r => r.id)]
    );

    const beforeMap = Object.fromEntries(targets.map(r => [r.id, r]));
    let changedCount = 0;
    for (const a of after) {
      const b = beforeMap[a.id];
      const xBefore = b.x_rate != null ? Number(b.x_rate).toFixed(1) : 'null';
      const xAfter  = a.x_rate != null ? Number(a.x_rate).toFixed(1) : 'null';
      const sBefore = b.s_rate != null ? Number(b.s_rate).toFixed(1) : 'null';
      const sAfter  = a.s_rate != null ? Number(a.s_rate).toFixed(1) : 'null';
      const changed = b.comp_rank !== a.comp_rank || xBefore !== xAfter || sBefore !== sAfter;
      if (!changed) continue;

      changedCount++;
      console.log(`\n  ${a.username}: ${b.comp_rank}→${a.comp_rank}  s_rate: ${sBefore}→${sAfter}  x_rate: ${xBefore}→${xAfter}`);

      const detail = await getUserScoreDetail(client, a.id, eventNumber);
      if (detail.best) {
        console.log(`    [最高] ${detail.best.event_name}  スコア: ${detail.best.score.toLocaleString()}  pt: ${detail.best.pt}`);
      }
      if (detail.recent.length > 0) {
        console.log(`    [直近4回]`);
        detail.recent.forEach((r, i) => {
          console.log(`      ${i + 1}. ${r.event_name}  スコア: ${r.score.toLocaleString()}  pt: ${r.pt}`);
        });
      }
      const xb = detail.xBreakdown;
      console.log(`    [Xレート内訳] ベスト: ${xb.newBestPt.toFixed(1)}pt(40%)  スコアタ・遭遇戦直近4回平均: ${xb.saSeraphRecent4.toFixed(1)}pt(40%)  EX(減衰): ${xb.exDecayed.toFixed(1)}pt(20%)  → 合成pt: ${xb.combinedXPt.toFixed(1)}`);
    }

    await client.query('COMMIT');
    console.log(`\n完了 (変更あり: ${changedCount} 人)`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('エラー:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
