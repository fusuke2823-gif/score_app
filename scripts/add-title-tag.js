const pool = require('../db/index');

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`ALTER TABLE titles ADD COLUMN IF NOT EXISTS tag VARCHAR(20)`);
    console.log('Added tag column to titles table');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
