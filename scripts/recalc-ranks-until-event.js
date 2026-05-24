// 指定イベントまでのスコアでランク・レートを再計算するスクリプト
// 実行例:
//   node scripts/recalc-ranks-until-event.js --event-id 42
//   node scripts/recalc-ranks-until-event.js --event-number 15

require('dotenv').config();
const pool = require('../db/index');
const { updateUserRanks } = require('../routes/rankUtils');

async function run() {
  const args = process.argv.slice(2);
  const idIdx  = args.indexOf('--event-id');
  const numIdx = args.indexOf('--event-number');

  if (idIdx === -1 && numIdx === -1) {
    console.error('使い方:');
    console.error('  node scripts/recalc-ranks-until-event.js --event-id <id>');
    console.error('  node scripts/recalc-ranks-until-event.js --event-number <number>');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    let eventNumber;

    if (idIdx !== -1) {
      const eventId = parseInt(args[idIdx + 1]);
      const { rows } = await client.query('SELECT event_number, name FROM events WHERE id = $1', [eventId]);
      if (!rows[0]) { console.error(`イベントID ${eventId} が見つかりません`); process.exit(1); }
      eventNumber = rows[0].event_number;
      console.log(`イベント: [${eventId}] ${rows[0].name} (イベント番号 ${eventNumber})`);
    } else {
      eventNumber = parseInt(args[numIdx + 1]);
      const { rows } = await client.query('SELECT id, name FROM events WHERE event_number = $1', [eventNumber]);
      if (!rows[0]) { console.error(`イベント番号 ${eventNumber} が見つかりません`); process.exit(1); }
      console.log(`イベント: [${rows[0].id}] ${rows[0].name} (イベント番号 ${eventNumber})`);
    }

    console.log(`→ イベント番号 ${eventNumber} 以前のスコアで全ユーザーのランク・レートを再計算します`);

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
      const rankChanged = b.comp_rank !== a.comp_rank;
      const xBefore = b.x_rate != null ? Number(b.x_rate).toFixed(1) : 'null';
      const xAfter  = a.x_rate != null ? Number(a.x_rate).toFixed(1) : 'null';
      const sBefore = b.s_rate != null ? Number(b.s_rate).toFixed(1) : 'null';
      const sAfter  = a.s_rate != null ? Number(a.s_rate).toFixed(1) : 'null';
      const changed = rankChanged || xBefore !== xAfter || sBefore !== sAfter;
      if (changed) {
        changedCount++;
        console.log(`  ${a.username}: ${b.comp_rank}→${a.comp_rank}  s_rate: ${sBefore}→${sAfter}  x_rate: ${xBefore}→${xAfter}`);
      }
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
