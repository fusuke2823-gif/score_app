// 一回限りのマイグレーション: events テーブルに score_multiplier カラムを追加
// 実行: node scripts/add-score-multiplier.js

require('dotenv').config();
const pool = require('../db/index');

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE events
      ADD COLUMN IF NOT EXISTS score_multiplier NUMERIC(6,4) DEFAULT 1.0
    `);
    console.log('score_multiplier カラムを追加しました（既存イベントはデフォルト1.0）');
  } catch (e) {
    console.error('エラー:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
