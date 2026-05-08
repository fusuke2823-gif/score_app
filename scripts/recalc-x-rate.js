// X/Exランクのx_rateを最新スコアで再計算するスクリプト（rank_pointsは変更しない）
// 実行: node scripts/recalc-x-rate.js

require('dotenv').config();
const pool = require('../db/index');
const { updateUserRanks } = require('../routes/rankUtils');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: targets } = await client.query(
      `SELECT id, username, comp_rank, x_rate FROM users WHERE comp_rank IN ('S', 'X', 'Ex') ORDER BY id`
    );
    console.log(`対象ユーザー: ${targets.length} 人 (S/X/Ex)`);

    await updateUserRanks(client, targets.map(r => r.id));

    const { rows: after } = await client.query(
      `SELECT id, username, comp_rank, x_rate FROM users WHERE id = ANY($1) ORDER BY id`,
      [targets.map(r => r.id)]
    );

    const beforeMap = Object.fromEntries(targets.map(r => [r.id, r]));
    for (const a of after) {
      const b = beforeMap[a.id];
      const xBefore = b.x_rate != null ? b.x_rate.toFixed(1) : 'null';
      const xAfter  = a.x_rate != null ? a.x_rate.toFixed(1) : 'null';
      const changed = b.comp_rank !== a.comp_rank || xBefore !== xAfter;
      if (changed) {
        console.log(`  ${a.username}: ${b.comp_rank} x_rate=${xBefore} → ${a.comp_rank} x_rate=${xAfter}`);
      }
    }

    await client.query('COMMIT');
    console.log('完了');
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
