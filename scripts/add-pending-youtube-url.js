require('dotenv').config();
const pool = require('../db/index');

async function run() {
  await pool.query(`ALTER TABLE scores ADD COLUMN IF NOT EXISTS pending_youtube_url TEXT`);
  await pool.query(`ALTER TABLE scores ADD COLUMN IF NOT EXISTS pending_youtube_score INTEGER`);
  console.log('Done: pending_youtube_url, pending_youtube_score added to scores');
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
