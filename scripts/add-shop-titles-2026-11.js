// ショップの購入称号を入れ替えるスクリプト（2026-11）。
// ・今ショップに出ている4つ（ヴァゥゥゥゥ！など）を非公開（is_active=FALSE）にする。持っている人の称号・装備はそのまま。
// ・新しい6つを 200pt・共通（common）・タグなしで追加する。
// 同じ名前の称号が既にあれば飛ばすので、再実行しても二重に作らない。
//
// 確認のみ（書き込まない）: node scripts/add-shop-titles-2026-11.js
// 実際に追加する:           node scripts/add-shop-titles-2026-11.js --apply

require('dotenv').config();
const pool = require('../db/index');

const NAMES = [
  'オーバードライブ中毒',
  'SPが足りない',
  '1ターンキル信者',
  'ナービィ保護団体',
  'ドームの住人',
  'ダンジョンランナー',
];
const HIDE_NAMES = [
  'ヴァゥゥゥゥ！',
  'シーレジェファン',
  'どこを見てんだブタ野郎？',
  'ブレイカーに人権を',
];
const POINT_COST = 200;
const DESCRIPTION = 'ポイント購入称号';
const APPLY = process.argv.includes('--apply');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hide = (await client.query(
      `SELECT id, name, point_cost FROM titles
       WHERE name = ANY($1) AND is_active = TRUE AND point_cost IS NOT NULL AND (tag IS NULL OR tag = '')`,
      [HIDE_NAMES]
    )).rows;
    console.log(`非公開にする称号: ${hide.length} 件`);
    hide.forEach(t => console.log(`  [${t.id}] ${t.name}（${t.point_cost}pt）`));

    const existing = (await client.query(
      'SELECT id, name, point_cost, is_active FROM titles WHERE name = ANY($1)',
      [NAMES]
    )).rows;
    const existingNames = new Set(existing.map(t => t.name));
    existing.forEach(t => console.log(`  既にあり（飛ばす）: [${t.id}] ${t.name}（${t.point_cost ?? '非売'}pt${t.is_active ? '' : '・無効'}）`));

    const toAdd = NAMES.filter(n => !existingNames.has(n));
    console.log(`\n追加する称号: ${toAdd.length} 件（各 ${POINT_COST}pt）`);
    toAdd.forEach(n => console.log(`  ${n}`));

    if (!APPLY) {
      await client.query('ROLLBACK');
      console.log('\n確認のみで終了しました。追加するには --apply を付けて実行してください。');
      return;
    }

    if (hide.length) {
      await client.query('UPDATE titles SET is_active = FALSE WHERE id = ANY($1)', [hide.map(t => t.id)]);
      console.log(`\n非公開にしました: ${hide.length} 件`);
    }
    for (const name of toAdd) {
      const r = await client.query(
        `INSERT INTO titles (name, description, point_cost, is_active, scope)
         VALUES ($1, $2, $3, TRUE, 'common') RETURNING id`,
        [name, DESCRIPTION, POINT_COST]
      );
      console.log(`  追加: [${r.rows[0].id}] ${name}`);
    }
    await client.query('COMMIT');
    console.log(`\n完了: 非公開 ${hide.length} 件、追加 ${toAdd.length} 件。`);
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
