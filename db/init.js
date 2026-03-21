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
      ALTER TABLE enemies ADD COLUMN IF NOT EXISTS weak_attributes TEXT;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS submission_start TIMESTAMPTZ;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS submission_end TIMESTAMPTZ;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS points_distributed BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_title_id INTEGER;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_date DATE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS login_streak INTEGER DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_frame_id INTEGER;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS total_login_days INTEGER NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS frames (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        point_cost INTEGER NOT NULL,
        css_class VARCHAR(50) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_frames (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        frame_id INTEGER REFERENCES frames(id) ON DELETE CASCADE,
        acquired_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, frame_id)
      );

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

      CREATE TABLE IF NOT EXISTS titles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        point_cost INTEGER,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_titles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title_id INTEGER REFERENCES titles(id) ON DELETE CASCADE,
        acquired_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, title_id)
      );

      CREATE TABLE IF NOT EXISTS point_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_icon_id INTEGER;

      CREATE TABLE IF NOT EXISTS gacha_icons (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        rarity VARCHAR(5) NOT NULL,
        image_url TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_icons (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        icon_id INTEGER REFERENCES gacha_icons(id) ON DELETE CASCADE,
        acquired_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, icon_id)
      );
    `);

    // 通知・ガチャ設定の初期値
    await client.query(`
      INSERT INTO settings (key, value) VALUES ('notify_on_submit', 'false') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('gacha_ss_rate', '3') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('gacha_s_rate', '15') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('gacha_a_rate', '82') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('gacha_single_cost', '50') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('gacha_multi_cost', '450') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('gacha_show_nav', 'false') ON CONFLICT (key) DO NOTHING;
    `);

    console.log('データベース初期化完了');
  } finally {
    client.release();
  }
};

module.exports = initDB;
