// スコアタ#103〜#104EX（イベント番号21〜24）に1度でも参加した人へ、アイコン230・231・232を配布するスクリプト。
// 参加の判定は最終配布と同じ（承認済みスコアがあり、ranking_scope が public か external）。
// 既に持っているアイコンは飛ばすので、再実行しても二重に付与しない。
//
// 確認のみ（書き込まない）: node scripts/award-sa103-104-icons.js
// 実際に配布する:           node scripts/award-sa103-104-icons.js --apply

require('dotenv').config();
const pool = require('../db/index');

const EVENT_NUMBERS = [21, 22, 23, 24];
const ICON_IDS = [230, 231, 232];
const APPLY = process.argv.includes('--apply');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const events = (await client.query(
      'SELECT id, name, event_number FROM events WHERE event_number = ANY($1) ORDER BY event_number',
      [EVENT_NUMBERS]
    )).rows;
    console.log('対象イベント:');
    events.forEach(e => console.log(`  第${e.event_number}回 ${e.name}`));
    if (events.length !== EVENT_NUMBERS.length) {
      throw new Error(`イベントが${EVENT_NUMBERS.length}件そろっていません（${events.length}件）`);
    }

    const icons = (await client.query(
      'SELECT id, name, rarity, is_active FROM gacha_icons WHERE id = ANY($1) ORDER BY id',
      [ICON_IDS]
    )).rows;
    console.log('\n配布するアイコン:');
    icons.forEach(i => console.log(`  [${i.id}] ${i.name}（${i.rarity}）${i.is_active ? '' : ' ※無効のアイコン'}`));
    if (icons.length !== ICON_IDS.length) {
      throw new Error(`アイコンが${ICON_IDS.length}件そろっていません（${icons.length}件）`);
    }

    const userIds = (await client.query(
      `SELECT DISTINCT s.user_id
       FROM scores s
       WHERE s.event_id = ANY($1)
         AND s.approved_score IS NOT NULL
         AND s.ranking_scope IN ('public', 'external')`,
      [events.map(e => e.id)]
    )).rows.map(r => r.user_id);
    console.log(`\n対象ユーザー: ${userIds.length} 人`);

    // アイコンごとに、既に持っている人数を数える
    const owned = (await client.query(
      `SELECT icon_id, COUNT(*)::int AS n
       FROM user_icons
       WHERE icon_id = ANY($1) AND user_id = ANY($2)
       GROUP BY icon_id`,
      [ICON_IDS, userIds]
    )).rows;
    const ownedOf = id => owned.find(o => o.icon_id === id)?.n || 0;

    let planned = 0;
    for (const id of ICON_IDS) {
      const add = userIds.length - ownedOf(id);
      planned += add;
      console.log(`  アイコン${id}: 新規 ${add} 人 / 所持済み ${ownedOf(id)} 人`);
    }

    if (!APPLY) {
      await client.query('ROLLBACK');
      console.log(`\n確認のみで終了しました（付与予定 ${planned} 件）。配布するには --apply を付けて実行してください。`);
      return;
    }

    const inserted = await client.query(
      `INSERT INTO user_icons (user_id, icon_id)
       SELECT u.user_id, i.icon_id
       FROM unnest($1::int[]) AS u(user_id)
       CROSS JOIN unnest($2::int[]) AS i(icon_id)
       ON CONFLICT (user_id, icon_id) DO NOTHING`,
      [userIds, ICON_IDS]
    );
    await client.query('COMMIT');
    console.log(`\n完了: ${inserted.rowCount} 件を付与しました。`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('エラー:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
