// 属性推定の実験用：過去のリザルト画像から、左に並ぶ6人の役割の札（ATK・BUF・ADM など）とMVPの位置を Gemini で読み取る
// （DBは読むだけ。結果は scripts/.attr-eval-roles.json に保存し、attr-eval.mjs が使う）
//
// 使い方：
//   DATABASE_URL=... GEMINI_API_KEY=... node scripts/attr-eval-roles.mjs [--limit 1500]
//   ・テスト：node scripts/attr-eval-roles.mjs --file 画像のパス  （1枚だけ読んで結果を表示）
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const require = createRequire(import.meta.url);
const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, process.argv.includes('--v2') ? '.attr-eval-roles2.json' : '.attr-eval-roles.json');
const MODEL = 'gemini-3.8-flash';
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : def; };

// 役割の札・6人の顔の位置・MVPの絵の位置・画面の種類をまとめて読む（位置は画像全体を0〜1000に正規化した [ymin, xmin, ymax, xmax]）
const SCHEMA = {
  type: 'object',
  properties: {
    event_type_guess: { type: 'string', enum: ['score_attack', 'score_attack_ex', 'seraph', 'unknown'] },
    members: { type: 'array', items: { type: 'object', properties: { role: { type: 'string' }, box: { type: 'array', items: { type: 'integer' } } }, required: ['role', 'box'] } },
    mvp_box: { type: 'array', items: { type: 'integer' } },
    mvp_index: { type: ['integer', 'null'] },
  },
  required: ['event_type_guess', 'members', 'mvp_box', 'mvp_index'],
};
const PROMPT = `これはスマートフォンRPGのリザルト画面です。
- members: 画面の左側に縦（または弧状）に並ぶ編成メンバー6人の丸い顔アイコンについて、上から順に、役割の札の文字（ATK, BLA, BRK, BUF, DBF, DEF, HLR, ADM など。読めない場合は "?"）と、顔アイコンの丸の部分の外接矩形 box=[ymin, xmin, ymax, xmax]（画像全体を0〜1000に正規化した整数）を返してください。札の文字は矩形に含めないでください。
- mvp_box: 画面中央に大きく描かれたMVPキャラクターの顔を中心とした範囲（顔〜胸あたり）の矩形 [ymin, xmin, ymax, xmax]（0〜1000）。遭遇戦の画面では中央左の大きな円の中の絵です。
- mvp_index: 「MVP」のマークが付いているアイコンが上から何番目か（0始まり）。見つからなければ null。
- event_type_guess: score_attack（ボス名とボーナス2項目）／score_attack_ex（ボス名とボーナス1項目）／seraph（演習名・戦術カード列あり）／unknown`;

const sizedUrl = url => (url.includes('res.cloudinary.com') ? url.replace(/\/upload\/(?:[^/]+\/)?(v\d+\/)/, '/upload/w_1280,c_limit/$1') : url);

async function readRoles(ai, buffer, mimeType) {
  const res = await ai.interactions.create({
    model: MODEL,
    input: [{ type: 'text', text: PROMPT }, { type: 'image', data: buffer.toString('base64'), mime_type: mimeType }],
    response_format: { type: 'text', mime_type: 'application/json', schema: SCHEMA },
  });
  const p = JSON.parse(res.output_text);
  const members = Array.isArray(p.members) ? p.members : [];
  return {
    roles: members.map(m => String(m.role).toUpperCase().trim()),
    boxes: members.map(m => m.box),
    mvpBox: p.mvp_box,
    type: p.event_type_guess,
    mvp: p.mvp_index,
  };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY を設定してください'); process.exit(1); }
  const ai = new GoogleGenAI({});
  const file = arg('file', null);
  if (file) {
    const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
    console.log(await readRoles(ai, fs.readFileSync(file), mime));
    return;
  }
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL を設定してください'); process.exit(1); }
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
  const { rows } = await pool.query(
    `SELECT s.id, s.approved_image_url AS url FROM scores s JOIN events e ON e.id = s.event_id
     WHERE s.approved_score IS NOT NULL AND s.approved_image_url IS NOT NULL AND e.event_type IN ('score_attack','score_attack_ex','seraph')
     ORDER BY s.id DESC LIMIT $1`, [parseInt(arg('limit', '1500'), 10)]);
  await pool.end();

  const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const todo = rows.filter(r => !out[r.id]);
  console.log(`対象 ${rows.length}件 / 読み取り ${todo.length}件（読み取り済みは再利用）`);
  let done = 0, failed = 0;
  const CONCURRENCY = parseInt(arg('concurrency', '4'), 10);
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const r = queue.shift();
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(sizedUrl(r.url));
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());
          out[r.id] = await readRoles(ai, buf, res.headers.get('content-type') || 'image/jpeg');
          break;
        } catch (err) {
          if (attempt === 2) { failed++; console.warn(`  失敗 id=${r.id}: ${err.message}`); }
          else await new Promise(s => setTimeout(s, 1500 * (attempt + 1)));
        }
      }
      if (++done % 50 === 0) { console.log(`  ${done}/${todo.length}`); fs.writeFileSync(OUT, JSON.stringify(out)); }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  fs.writeFileSync(OUT, JSON.stringify(out));
  const all = Object.values(out);
  const roleCount = {};
  all.forEach(o => o.roles.forEach(r => { roleCount[r] = (roleCount[r] || 0) + 1; }));
  console.log(`完了（失敗 ${failed}件）。役割の出現数:`, roleCount, '／ ADMを含む編成:', all.filter(o => o.roles.includes('ADM')).length);
}

main().catch(err => { console.error(err); process.exit(1); });
