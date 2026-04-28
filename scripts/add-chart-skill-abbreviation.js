require('dotenv').config();
const pool = require('../db/index');

async function run() {
  await pool.query(`ALTER TABLE chart_skills ADD COLUMN IF NOT EXISTS abbreviation TEXT`);
  console.log('chart_skills.abbreviation added');
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
