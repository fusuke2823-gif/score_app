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
      ALTER TABLE gacha_icons ADD COLUMN IF NOT EXISTS unit VARCHAR(10);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS gp INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS gp_migrated BOOLEAN NOT NULL DEFAULT FALSE;

      CREATE TABLE IF NOT EXISTS gp_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

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

      CREATE TABLE IF NOT EXISTS special_login_bonuses (
        id SERIAL PRIMARY KEY,
        title VARCHAR(100) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        max_claims INTEGER NOT NULL DEFAULT 1,
        points_per_claim INTEGER NOT NULL DEFAULT 1,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS special_login_bonus_claims (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        bonus_id INTEGER REFERENCES special_login_bonuses(id) ON DELETE CASCADE,
        claimed_count INTEGER DEFAULT 0,
        last_claimed_date DATE,
        UNIQUE(user_id, bonus_id)
      );

      CREATE TABLE IF NOT EXISTS gacha_pools (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        image_url TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      ALTER TABLE gacha_pools ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE gacha_pools ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ;
      ALTER TABLE gacha_pools ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS points_distributed_at TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS gacha_pool_icons (
        pool_id INTEGER REFERENCES gacha_pools(id) ON DELETE CASCADE,
        icon_id INTEGER REFERENCES gacha_icons(id) ON DELETE CASCADE,
        PRIMARY KEY (pool_id, icon_id)
      );

      CREATE TABLE IF NOT EXISTS gacha_pool_pickups (
        pool_id INTEGER REFERENCES gacha_pools(id) ON DELETE CASCADE,
        icon_id INTEGER REFERENCES gacha_icons(id) ON DELETE CASCADE,
        PRIMARY KEY (pool_id, icon_id)
      );

      CREATE TABLE IF NOT EXISTS gacha_pull_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        pool_id INTEGER REFERENCES gacha_pools(id) ON DELETE SET NULL,
        pull_type VARCHAR(10) NOT NULL,
        pulled_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS event_interim_distributions (
        id SERIAL PRIMARY KEY,
        event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
        distributed_count INTEGER NOT NULL DEFAULT 0,
        distributed_at TIMESTAMPTZ DEFAULT NOW()
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
      INSERT INTO settings (key, value) VALUES ('gacha_dup_ss_pts', '30') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('gacha_dup_s_pts', '10') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('gacha_dup_a_pts', '3') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('rank_pts_1', '100') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('rank_pts_2_3', '95') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('rank_pts_4_5', '90') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('rank_pts_6_10', '80') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('rank_pts_11_15', '60') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('rank_pts_16_20', '50') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('rank_pts_21plus', '30') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('login_bonus_day1', '1') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('login_bonus_day2', '1') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('login_bonus_day3', '1') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('login_bonus_day4', '1') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('login_bonus_day5', '1') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('login_bonus_day6', '1') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('login_bonus_day7', '4') ON CONFLICT (key) DO NOTHING;
    `);

    console.log('データベース初期化完了');
  } finally {
    client.release();
  }
};

module.exports = initDB;
