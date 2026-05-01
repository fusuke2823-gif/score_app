const pool = require('../db/index');

async function main() {
  const client = await pool.connect();
  try {
    // 既存のoshi称号を削除して再作成（--rebuild フラグ付きの場合）
    const rebuild = process.argv.includes('--rebuild');
    if (rebuild) {
      await client.query(`DELETE FROM titles WHERE tag='oshi'`);
      console.log('Deleted existing oshi titles');
    }

    const chars = await client.query(
      `SELECT abbreviation, sort_order FROM chart_characters WHERE abbreviation IS NOT NULL AND abbreviation <> '' ORDER BY sort_order, name`
    );
    let inserted = 0, skipped = 0;
    for (const { abbreviation, sort_order } of chars.rows) {
      const name = `${abbreviation}推し`;
      const exists = await client.query('SELECT id FROM titles WHERE name=$1', [name]);
      if (exists.rows.length) { skipped++; continue; }
      await client.query(
        `INSERT INTO titles (name, description, point_cost, is_active, scope, tag, sort_order) VALUES ($1, $2, $3, TRUE, 'common', 'oshi', $4)`,
        [name, 'ポイント購入称号（推し）', 200, sort_order]
      );
      inserted++;
    }
    console.log(`Done: inserted=${inserted}, skipped=${skipped}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
