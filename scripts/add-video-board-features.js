require('dotenv').config();
const pool = require('../db/index');

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE video_board ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS pending_videos (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        event_id INTEGER NOT NULL REFERENCES events(id),
        attribute TEXT NOT NULL,
        video_url TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        admin_note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('video_board.hidden カラム追加・pending_videos テーブル作成完了');
  } catch (e) {
    console.error('エラー:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
