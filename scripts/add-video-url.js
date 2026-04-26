// 一回限りのマイグレーション: scores テーブルに video_url カラムを追加
// 実行: node scripts/add-video-url.js

require('dotenv').config();
const pool = require('../db/index');

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE scores
      ADD COLUMN IF NOT EXISTS video_url TEXT
    `);
    // 既存の承認済みスコアで youtube_url がある行を一括セット
    const res = await client.query(`
      UPDATE scores SET video_url = youtube_url
      WHERE status = 'approved' AND youtube_url IS NOT NULL AND video_url IS NULL
    `);
    console.log(`video_url カラム追加完了。既存データ更新: ${res.rowCount} 件`);
  } catch (e) {
    console.error('エラー:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
