// イベント番号16・17（スコアタ#101 通常・EX）で光属性の承認済みスコアを投稿した人に
// 称号「陽のさす向こうへ」と300ptを配布し、お知らせを1件発行するスクリプト。
// 再実行しても、既に称号を持っている人には二重付与しない（冪等）。
//
// 実行: node scripts/award-event16-17-light-title.js

require('dotenv').config();
const pool = require('../db/index');

const EVENT_NUMBERS = [16, 17];
const ATTRIBUTE = '光';
const TITLE_NAME = '陽のさす向こうへ';
const TITLE_DESC = 'スコアタ#101通常・EX光属性キャンペーン報酬';
const TITLE_SCOPE = 'common';
const POINTS = 300;

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const evRes = await client.query(
      'SELECT id, name, event_number FROM events WHERE event_number = ANY($1) ORDER BY event_number',
      [EVENT_NUMBERS]
    );
    if (evRes.rows.length === 0) throw new Error(`イベント番号 ${EVENT_NUMBERS.join('・')} が見つかりません`);
    console.log('対象イベント:');
    evRes.rows.forEach(e => console.log(`  [${e.id}] 第${e.event_number}回 ${e.name}`));
    const eventIds = evRes.rows.map(e => e.id);

    // 称号を取得 or 新規作成
    let titleId;
    const existingTitle = await client.query(
      'SELECT id FROM titles WHERE name=$1 AND scope=$2',
      [TITLE_NAME, TITLE_SCOPE]
    );
    if (existingTitle.rows.length > 0) {
      titleId = existingTitle.rows[0].id;
      console.log(`\n称号は既存のものを使用: [${titleId}] ${TITLE_NAME}`);
    } else {
      const tr = await client.query(
        'INSERT INTO titles (name, description, point_cost, is_active, scope) VALUES ($1, $2, NULL, TRUE, $3) RETURNING id',
        [TITLE_NAME, TITLE_DESC, TITLE_SCOPE]
      );
      titleId = tr.rows[0].id;
      console.log(`\n称号を新規作成: [${titleId}] ${TITLE_NAME}`);
    }

    // 対象ユーザー抽出（承認済みスコアのみ）
    const targetRes = await client.query(
      `SELECT DISTINCT s.user_id, u.username
       FROM scores s
       JOIN users u ON u.id = s.user_id
       WHERE s.event_id = ANY($1)
         AND s.attribute = $2
         AND s.approved_score IS NOT NULL
       ORDER BY s.user_id`,
      [eventIds, ATTRIBUTE]
    );
    console.log(`対象ユーザー: ${targetRes.rows.length} 人\n`);

    let awardedCount = 0;
    let skippedCount = 0;
    for (const row of targetRes.rows) {
      const already = await client.query(
        'SELECT 1 FROM user_titles WHERE user_id=$1 AND title_id=$2',
        [row.user_id, titleId]
      );
      if (already.rows.length > 0) {
        skippedCount++;
        continue;
      }
      await client.query(
        'INSERT INTO user_titles (user_id, title_id) VALUES ($1, $2)',
        [row.user_id, titleId]
      );
      await client.query('UPDATE users SET points = points + $1 WHERE id = $2', [POINTS, row.user_id]);
      await client.query(
        'INSERT INTO point_history (user_id, amount, reason) VALUES ($1, $2, $3)',
        [row.user_id, POINTS, TITLE_DESC]
      );
      awardedCount++;
      console.log(`  付与: ${row.username} (user_id=${row.user_id})`);
    }

    // お知らせを1件発行（既に同タイトルのお知らせがあれば重複作成しない）
    const annTitle = 'スコアタ#101 光属性キャンペーン報酬配布';
    const existingAnn = await client.query('SELECT id FROM announcements WHERE title=$1', [annTitle]);
    if (existingAnn.rows.length > 0) {
      console.log(`\nお知らせは既に存在するため作成をスキップ: [${existingAnn.rows[0].id}] ${annTitle}`);
    } else {
      const annBody = `スコアタ#101（通常・EX）で光属性のスコアを投稿された方に、称号「${TITLE_NAME}」と${POINTS}ptを配布しました。ショップの称号一覧からご確認・装備いただけます。`;
      const annRes = await client.query(
        `INSERT INTO announcements (title, body, link_url, link_label, is_active)
         VALUES ($1, $2, $3, $4, TRUE) RETURNING id`,
        [annTitle, annBody, '/shop.html', '称号を確認する']
      );
      console.log(`\nお知らせを発行: [${annRes.rows[0].id}] ${annTitle}`);
    }

    await client.query('COMMIT');
    console.log(`\n完了: 新規付与 ${awardedCount} 人 / 既に付与済みでスキップ ${skippedCount} 人`);
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
