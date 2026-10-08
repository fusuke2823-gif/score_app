// 属性の自動判定の最初のお手本を入れる（実験 scripts/attr-eval.mjs で計算済みの特徴と、attr-eval-roles.mjs で読んだ役割を使う）
//
// 使い方：
//   DATABASE_URL=... node scripts/attr-backfill.mjs           … 入れる件数を表示するだけ（DBは変更しない）
//   DATABASE_URL=... node scripts/attr-backfill.mjs --apply   … score_vectors に書き込む（既にある画像は上書きしない）
//   --v2 … Geminiの顔の位置で切り出し直したもの（.attr-eval-cache2-fixed.json / .attr-eval-roles2.json）を使う
//   --replace … 既にある画像も上書きする（切り出しを直したときの入れ替え用）
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const DIR = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

const V2 = process.argv.includes('--v2');
const REPLACE = process.argv.includes('--replace');
const cache = JSON.parse(fs.readFileSync(path.join(DIR, V2 ? '.attr-eval-cache2-fixed.json' : '.attr-eval-cache.json'), 'utf8'));
const roles = JSON.parse(fs.readFileSync(path.join(DIR, V2 ? '.attr-eval-roles2.json' : '.attr-eval-roles.json'), 'utf8'));
const f32 = arr => Buffer.from(new Float32Array(arr).buffer);

async function main() {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL を設定してください'); process.exit(1); }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
  const ids = Object.keys(cache).map(Number);
  const { rows } = await pool.query(
    `SELECT s.id, s.approved_image_url, e.event_type FROM scores s JOIN events e ON e.id = s.event_id
     WHERE s.id = ANY($1) AND s.approved_image_url IS NOT NULL`, [ids]);
  const items = rows.filter(r => cache[r.id]);
  // v2 は画面の種類もGeminiの読み取りを使う
  for (const r of items) if (V2 && roles[r.id]?.type && roles[r.id].type !== 'unknown') r.event_type = roles[r.id].type;
  const withRoles = items.filter(r => roles[r.id]?.roles?.length === 6);
  console.log(`計算済み ${ids.length}件 ／ 今も承認済みの画像がある ${items.length}件 ／ 役割も読めている ${withRoles.length}件`);
  if (!APPLY) {
    console.log('（確認だけです。書き込むには --apply を付けて実行してください）');
    await pool.end();
    return;
  }
  // テーブルがまだ無い場合に備えて作る（db/init.js と同じ定義）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS score_vectors (
      image_url TEXT PRIMARY KEY,
      score_id INTEGER REFERENCES scores(id) ON DELETE SET NULL,
      event_type VARCHAR(30),
      roles TEXT[],
      mvp BYTEA NOT NULL,
      icons BYTEA NOT NULL,
      excluded BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  let inserted = 0;
  for (const r of items) {
    const c = cache[r.id];
    const rl = roles[r.id]?.roles?.length === 6 ? roles[r.id].roles : null;
    const res = await pool.query(
      `INSERT INTO score_vectors (image_url, score_id, event_type, roles, mvp, icons)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (image_url) DO ${REPLACE ? 'UPDATE SET score_id = $2, event_type = $3, roles = $4, mvp = $5, icons = $6' : 'NOTHING'}`,
      [r.approved_image_url, r.id, r.event_type, rl, f32(c.mvp), f32(c.icons.flat())]
    );
    inserted += res.rowCount;
  }
  console.log(`書き込み ${inserted}件${REPLACE ? '（既にあった画像は上書き）' : '（既にあった画像はそのまま）'}`);
  await pool.end();
}
main().catch(err => { console.error(err); process.exit(1); });
