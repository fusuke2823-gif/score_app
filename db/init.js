const pool = require('./index');
const bcrypt = require('bcryptjs');

const initDB = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        oshi_character VARCHAR(100),
        role VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        event_number INTEGER UNIQUE NOT NULL,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS enemies (
        id SERIAL PRIMARY KEY,
        event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        image_url TEXT,
        hp BIGINT,
        dp BIGINT,
        ep BIGINT,
        use_ep BOOLEAN DEFAULT FALSE,
        destruction_rate VARCHAR(50),
        order_index INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS enemy_rules (
        id SERIAL PRIMARY KEY,
        enemy_id INTEGER REFERENCES enemies(id) ON DELETE CASCADE,
        rule_text TEXT NOT NULL,
        order_index INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scores (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
        attribute VARCHAR(10) NOT NULL,
        approved_score BIGINT,
        pending_score BIGINT,
        approved_image_url TEXT,
        pending_image_url TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        admin_note TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, event_id, attribute)
      );
    `);

    // 管理者アカウントの自動作成
    if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
      const existing = await client.query(
        'SELECT id FROM users WHERE username = $1',
        [process.env.ADMIN_USERNAME]
      );
      if (existing.rows.length === 0) {
        const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
        await client.query(
          "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')",
          [process.env.ADMIN_USERNAME, hash]
        );
        console.log(`管理者アカウントを作成しました: ${process.env.ADMIN_USERNAME}`);
      }
    }

    // カラム追加・テーブル追加（既存DBへのマイグレーション）
    await client.query(`
      ALTER TABLE events ADD COLUMN IF NOT EXISTS submission_start TIMESTAMPTZ;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS submission_end TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS event_rules (
        id SERIAL PRIMARY KEY,
        event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
        rule_text TEXT NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // 通知設定の初期値
    await client.query(`
      INSERT INTO settings (key, value) VALUES ('notify_on_submit', 'false')
      ON CONFLICT (key) DO NOTHING
    `);

    console.log('データベース初期化完了');
  } finally {
    client.release();
  }
};

module.exports = initDB;
