require('dotenv').config();
const pool = require('../db/index');
const fs = require('fs');

function parseCSV(filePath) {
  return fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .slice(1) // skip header
    .map(line => line.split(',').map(s => s.trim()));
}

async function importCharacters(file) {
  const rows = parseCSV(file);
  let count = 0;
  for (const [name, sort_order] of rows) {
    if (!name) continue;
    await pool.query(
      `INSERT INTO chart_characters (name, sort_order) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET sort_order = $2`,
      [name, parseInt(sort_order) || 0]
    );
    count++;
  }
  console.log(`Characters: ${count} rows`);
}

async function importStyles(file) {
  const rows = parseCSV(file);
  let count = 0, skip = 0;
  for (const [character_name, style_name, has_special] of rows) {
    if (!character_name || !style_name) continue;
    const c = await pool.query('SELECT id FROM chart_characters WHERE name=$1', [character_name]);
    if (!c.rows.length) { console.warn(`  skip: char not found "${character_name}"`); skip++; continue; }
    await pool.query(
      `INSERT INTO chart_styles (character_id, name, has_special_skill) VALUES ($1, $2, $3)
       ON CONFLICT (character_id, name) DO UPDATE SET has_special_skill = $3`,
      [c.rows[0].id, style_name, has_special === '1']
    );
    count++;
  }
  console.log(`Styles: ${count} rows (${skip} skipped)`);
}

async function importSkills(file) {
  const rows = parseCSV(file);
  let count = 0, skip = 0;
  for (const [character_name, skill_name, has_target, style_name, is_special] of rows) {
    if (!skill_name) continue;
    let charId = null;
    if (character_name) {
      const c = await pool.query('SELECT id FROM chart_characters WHERE name=$1', [character_name]);
      if (!c.rows.length) { console.warn(`  skip: char not found "${character_name}"`); skip++; continue; }
      charId = c.rows[0].id;
    }
    let styleId = null;
    if (style_name && charId) {
      const s = await pool.query('SELECT id FROM chart_styles WHERE character_id=$1 AND name=$2', [charId, style_name]);
      if (s.rows.length) styleId = s.rows[0].id;
    }
    await pool.query(
      `INSERT INTO chart_skills (character_id, name, has_target, style_id, is_special)
       VALUES ($1, $2, $3, $4, $5)`,
      [charId, skill_name, has_target === '1', styleId, is_special === '1']
    );
    count++;
  }
  console.log(`Skills: ${count} rows (${skip} skipped)`);
}

async function run() {
  const [type, file] = process.argv.slice(2);
  if (!type || !file) {
    console.log('Usage: node import-chart-csv.js <characters|styles|skills> <file.csv>');
    process.exit(1);
  }
  if (type === 'characters') await importCharacters(file);
  else if (type === 'styles') await importStyles(file);
  else if (type === 'skills') await importSkills(file);
  else { console.error('Unknown type'); process.exit(1); }
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
