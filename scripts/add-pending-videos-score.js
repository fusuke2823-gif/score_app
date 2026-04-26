require('dotenv').config();
const pool = require('../db/index');

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`ALTER TABLE pending_videos ADD COLUMN IF NOT EXISTS pending_score INTEGER`);
    await client.query(`ALTER TABLE pending_videos ADD COLUMN IF NOT EXISTS pending_image_url TEXT`);
    console.log('pending_videos にスコア・画像カラム追加完了');
  } catch (e) {
    console.error('エラー:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
