const pool = require('../db/index');

function generateCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS user_code VARCHAR(8) UNIQUE`);
    console.log('Added user_code column');

    const users = await client.query(`SELECT id FROM users WHERE user_code IS NULL`);
    let updated = 0;
    for (const { id } of users.rows) {
      let code;
      for (let i = 0; i < 20; i++) {
        code = generateCode();
        const r = await client.query(`SELECT id FROM users WHERE user_code=$1`, [code]);
        if (!r.rows.length) break;
      }
      await client.query(`UPDATE users SET user_code=$1 WHERE id=$2`, [code, id]);
      updated++;
    }
    console.log(`Done: ${updated} users assigned user_code`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
