require('dotenv').config();
const pool = require('../db/index');

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chart_characters (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS chart_styles (
      id SERIAL PRIMARY KEY,
      character_id INTEGER REFERENCES chart_characters(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      has_special_skill BOOLEAN DEFAULT FALSE,
      UNIQUE(character_id, name)
    );

    CREATE TABLE IF NOT EXISTS chart_skills (
      id SERIAL PRIMARY KEY,
      character_id INTEGER REFERENCES chart_characters(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      has_target BOOLEAN DEFAULT FALSE,
      style_id INTEGER REFERENCES chart_styles(id) ON DELETE CASCADE,
      is_special BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS charts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
      attribute TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      chart_code TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chart_members (
      id SERIAL PRIMARY KEY,
      chart_id INTEGER REFERENCES charts(id) ON DELETE CASCADE,
      slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 6),
      character_id INTEGER REFERENCES chart_characters(id),
      style_id INTEGER REFERENCES chart_styles(id),
      refine_count INTEGER DEFAULT 0 CHECK (refine_count BETWEEN 0 AND 4),
      UNIQUE(chart_id, slot)
    );

    CREATE TABLE IF NOT EXISTS chart_turns (
      id SERIAL PRIMARY KEY,
      chart_id INTEGER REFERENCES charts(id) ON DELETE CASCADE,
      seq_order FLOAT NOT NULL,
      turn_type TEXT NOT NULL CHECK (turn_type IN ('normal','extra','od_pre','od_post','special')),
      od_index INTEGER,
      od_total INTEGER,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS chart_actions (
      id SERIAL PRIMARY KEY,
      chart_turn_id INTEGER REFERENCES chart_turns(id) ON DELETE CASCADE,
      member_slot INTEGER NOT NULL CHECK (member_slot BETWEEN 1 AND 6),
      skill_id INTEGER REFERENCES chart_skills(id),
      target_slot INTEGER CHECK (target_slot BETWEEN 1 AND 6),
      order_num INTEGER CHECK (order_num BETWEEN 1 AND 3),
      UNIQUE(chart_turn_id, member_slot)
    );
  `);
  console.log('Chart tables created');
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
