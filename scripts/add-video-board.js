require('dotenv').config();
const pool = require('../db/index');

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS video_board (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        event_id INTEGER NOT NULL REFERENCES events(id),
        attribute TEXT NOT NULL,
        video_url TEXT NOT NULL,
        approved_image_url TEXT,
        approved_score INTEGER,
        is_anonymous BOOLEAN DEFAULT false,
        ranking_scope TEXT DEFAULT 'public',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, event_id, attribute, video_url)
      )
    `);
    const res = await client.query(`
      INSERT INTO video_board (user_id, event_id, attribute, video_url, approved_image_url, approved_score, is_anonymous, ranking_scope)
      SELECT user_id, event_id, attribute, video_url, approved_image_url, approved_score, is_anonymous, ranking_scope
      FROM scores
      WHERE video_url IS NOT NULL
        AND approved_score IS NOT NULL
        AND ranking_scope = 'public'
      ON CONFLICT (user_id, event_id, attribute, video_url) DO NOTHING
    `);
    console.log(`video_board テーブル作成完了。バックフィル: ${res.rowCount} 件`);
  } catch (e) {
    console.error('エラー:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
