// イベント13 外部称号修正スクリプト
//   1. 名前に"95"を含む称号をuser_titlesごと全削除
//   2. イベントID=13の外部ランキングで全称号を新規付与
//
// 実行: node scripts/fix-event13-titles.js

require('dotenv').config();
const pool = require('../db/index');

const EVENT_ID = 13;
const ATTRIBUTES = ['火', '氷', '雷', '光', '闇', '無'];

async function awardTitle(client, userId, name, description, scope) {
  const existing = await client.query(
    'SELECT id FROM titles WHERE name=$1 AND scope=$2',
    [name, scope]
  );
  let titleId;
  if (existing.rows.length > 0) {
    titleId = existing.rows[0].id;
  } else {
    const tr = await client.query(
      'INSERT INTO titles (name, description, point_cost, is_active, scope) VALUES ($1, $2, NULL, TRUE, $3) RETURNING id',
      [name, description, scope]
    );
    titleId = tr.rows[0].id;
  }
  await client.query(
    'INSERT INTO user_titles (user_id, title_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userId, titleId]
  );
  return name;
}

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. "95"含む称号をuser_titlesごと全削除
    const badTitles = await client.query(
      `SELECT id, name FROM titles WHERE name LIKE '%95%'`
    );
    console.log(`"95"含む称号: ${badTitles.rows.length} 件`);
    for (const t of badTitles.rows) {
      console.log(`  削除: [${t.id}] ${t.name}`);
    }
    if (badTitles.rows.length > 0) {
      const ids = badTitles.rows.map(t => t.id);
      const utDel = await client.query(
        `DELETE FROM user_titles WHERE title_id = ANY($1)`, [ids]
      );
      console.log(`  user_titles削除: ${utDel.rowCount} 件`);
      const tDel = await client.query(
        `DELETE FROM titles WHERE id = ANY($1)`, [ids]
      );
      console.log(`  titles削除: ${tDel.rowCount} 件`);
    }

    // 2. イベント取得
    const evRes = await client.query('SELECT * FROM events WHERE id=$1', [EVENT_ID]);
    if (evRes.rows.length === 0) throw new Error(`イベントID=${EVENT_ID}が見つかりません`);
    const event = evRes.rows[0];
    console.log(`\nイベント: ${event.name} (第${event.event_number}回)`);

    // 3. 外部ランキング計算
    const rankResult = await client.query(
      `WITH best AS (
         SELECT DISTINCT ON (s.user_id)
           s.user_id, s.approved_score
         FROM scores s
         WHERE s.event_id=$1 AND s.approved_score IS NOT NULL AND s.ranking_scope IN ('public', 'external')
         ORDER BY s.user_id, s.approved_score DESC
       )
       SELECT user_id, approved_score,
         RANK() OVER (ORDER BY approved_score DESC) AS rank
       FROM best`,
      [EVENT_ID]
    );
    console.log(`外部ランキング対象: ${rankResult.rows.length} 名`);

    const awardedTitles = [];

    // 4. 総合称号（全て付与）
    const overallDefs = [
      { ranks: [1],        label: '優勝' },
      { ranks: [2],        label: '準優勝' },
      { ranks: [3],        label: '第3位' },
      { maxRank: 10,       label: 'TOP10' },
      { maxRank: 30,       label: 'TOP30' },
      { maxRank: 50,       label: 'TOP50' },
    ];
    for (const def of overallDefs) {
      const targets = def.ranks
        ? rankResult.rows.filter(r => def.ranks.includes(Number(r.rank)))
        : rankResult.rows.filter(r => Number(r.rank) <= def.maxRank);
      for (const row of targets) {
        const t = await awardTitle(client, row.user_id,
          `${event.name} ${def.label}`, `${event.name} ${def.label}達成`, 'external');
        awardedTitles.push(`${t}(${row.rank}位)`);
      }
    }

    // 5. 属性別称号（全て付与）
    const attrDefs = [
      { exactRank: 1, label: '1位' },
      { exactRank: 2, label: '2位' },
      { exactRank: 3, label: '3位' },
      { maxRank: 5,   label: 'TOP5' },
    ];
    for (const attr of ATTRIBUTES) {
      const attrRankResult = await client.query(
        `SELECT s.user_id,
           RANK() OVER (ORDER BY MAX(s.approved_score) DESC) AS rank
         FROM scores s
         WHERE s.event_id=$1 AND s.approved_score IS NOT NULL AND s.attribute=$2 AND s.ranking_scope IN ('public', 'external')
         GROUP BY s.user_id`,
        [EVENT_ID, attr]
      );
      for (const def of attrDefs) {
        const rows = attrRankResult.rows.filter(r =>
          def.exactRank != null ? Number(r.rank) === def.exactRank : Number(r.rank) <= def.maxRank
        );
        for (const row of rows) {
          const t = await awardTitle(client, row.user_id,
            `${event.name} ${attr}属性${def.label}`,
            `${event.name} ${attr}属性${def.label}達成`, 'external');
          awardedTitles.push(`${t}`);
        }
        // 属性1位3回達成で「X神」称号
        if (def.exactRank === 1) {
          for (const row of attrRankResult.rows.filter(r => Number(r.rank) === 1)) {
            const countRes = await client.query(
              `SELECT COUNT(*) FROM user_titles ut JOIN titles t ON t.id=ut.title_id
               WHERE ut.user_id=$1 AND t.name LIKE $2 AND t.scope='external'`,
              [row.user_id, `%${attr}属性1位`]
            );
            if (parseInt(countRes.rows[0].count) >= 3) {
              const godTitle = `${attr}神`;
              const already = await client.query(
                `SELECT 1 FROM user_titles ut JOIN titles t ON t.id=ut.title_id
                 WHERE ut.user_id=$1 AND t.name=$2 AND t.scope='external'`,
                [row.user_id, godTitle]
              );
              if (already.rows.length === 0) {
                const t = await awardTitle(client, row.user_id, godTitle, `${attr}属性1位を3回達成`, 'external');
                awardedTitles.push(t);
              }
            }
          }
        }
      }
    }

    await client.query('COMMIT');
    console.log(`\n付与した称号 (${awardedTitles.length} 件):`);
    awardedTitles.forEach(t => console.log(`  ${t}`));
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
