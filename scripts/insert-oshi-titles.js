const pool = require('../db/index');

async function main() {
  const client = await pool.connect();
  try {
    const chars = await client.query(
      `SELECT abbreviation FROM chart_characters WHERE abbreviation IS NOT NULL AND abbreviation <> '' ORDER BY sort_order, name`
    );
    let inserted = 0, skipped = 0;
    for (const { abbreviation } of chars.rows) {
      const name = `${abbreviation}推し`;
      const exists = await client.query('SELECT id FROM titles WHERE name=$1', [name]);
      if (exists.rows.length) { skipped++; continue; }
      await client.query(
        `INSERT INTO titles (name, description, point_cost, is_active, scope, tag) VALUES ($1, $2, $3, TRUE, 'common', 'oshi')`,
        [name, 'ポイント購入称号（推し）', 200]
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
