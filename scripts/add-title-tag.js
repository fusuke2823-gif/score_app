const pool = require('../db/index');

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`ALTER TABLE titles ADD COLUMN IF NOT EXISTS tag VARCHAR(20)`);
    await client.query(`ALTER TABLE titles ADD COLUMN IF NOT EXISTS sort_order INTEGER`);
    console.log('Added tag, sort_order columns to titles table');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
