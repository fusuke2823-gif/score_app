require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await pool.query(`ALTER TABLE chart_styles ADD COLUMN IF NOT EXISTS abbreviation TEXT`);
  console.log('Done: chart_styles.abbreviation added');
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
