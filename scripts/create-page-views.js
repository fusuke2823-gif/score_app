const pool = require('../db/index');

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS page_views (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_internal BOOLEAN NOT NULL DEFAULT FALSE,
        page VARCHAR(200) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_page_views_page ON page_views(page, created_at)`);
    console.log('Created page_views table and indexes');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
