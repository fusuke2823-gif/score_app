// 一回限りの移行スクリプト:
//   1. 全ユーザーをランクCにリセット
//   2. 第12回イベントの承認済みスコア（全スコープ）からランクポイントを再計算
//   3. 全ユーザーのランクを再計算
//
// 実行: node scripts/reset-ranks-event12.js

require('dotenv').config();
const pool = require('../db/index');
const { convertScoreToPoints, updateUserRanks } = require('../routes/rankUtils');

const EVENT_NUMBER = 6;

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. 全ユーザーをCにリセット
    const resetRes = await client.query(
      `UPDATE users SET comp_rank='C', s_rate=NULL, x_rate=NULL, rank_points=0`
    );
    console.log(`リセット: ${resetRes.rowCount} 件`);

    // 2. 対象イベント取得
    const evRes = await client.query(
      'SELECT * FROM events WHERE event_number=$1', [EVENT_NUMBER]
    );
    if (evRes.rows.length === 0) throw new Error(`第${EVENT_NUMBER}回イベントが見つかりません`);
    const ev = evRes.rows[0];
    console.log(`対象イベント: ${ev.name} (id=${ev.id})`);

    // 3. 複数敵補正係数
    const ecRes = await client.query(
      'SELECT COUNT(*) AS cnt FROM enemies WHERE event_id=$1', [ev.id]
    );
    const enemyCount = parseInt(ecRes.rows[0].cnt);
    console.log(`敵数: ${enemyCount}${enemyCount > 1 ? ' → /1.05補正あり' : ''}`);

    // 4. 全スコープの承認済みスコア（ユーザーごとベスト1件）
    const scoreRes = await client.query(
      `SELECT DISTINCT ON (user_id) user_id, approved_score
       FROM scores
       WHERE event_id=$1 AND approved_score IS NOT NULL
       ORDER BY user_id, approved_score DESC`,
      [ev.id]
    );
    console.log(`スコア件数: ${scoreRes.rows.length} 件`);

    // 5. ランクポイントをセット
    for (const row of scoreRes.rows) {
      const corrected = enemyCount > 1 ? row.approved_score / 1.05 : row.approved_score;
      const rp = convertScoreToPoints(corrected);
      await client.query('UPDATE users SET rank_points=$1 WHERE id=$2', [rp, row.user_id]);
    }

    // 6. 全ユーザーのランク再計算
    const { rows: allUsers } = await client.query('SELECT id FROM users');
    console.log(`ランク再計算: ${allUsers.length} 人...`);
    await updateUserRanks(client, allUsers.map(r => r.id), { maxEventNumber: EVENT_NUMBER });

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
