// リザルト画像から属性を推定できるかの実験（DBは読むだけで、何も書き換えない）
//
// 方法：過去の承認済みリザルト画像を「お手本」にして、似ている画像の属性で多数決する
//   ① 中央のMVPの立ち絵が似ている投稿を探し、その属性で多数決
//   ② 割れた場合（複数属性で攻撃できるスタイル）は、編成6人の顔が多く重なる投稿に絞って多数決（並び順は無視）
// 1枚ずつ「自分以外の投稿」から当てさせて、正解率を出す
//
// 使い方：
//   npm i --no-save @huggingface/transformers
//   DATABASE_URL=... node scripts/attr-eval.mjs [--limit 1500] [--types score_attack,score_attack_ex,seraph] [--debug-crops 5]
//   ・初回は画像のダウンロードと変換に時間がかかる（変換結果は scripts/.attr-eval-cache.json に保存し、2回目以降は再利用）
//   ・外れた投稿は scripts/attr-eval-misses.csv に出す（画像URL付き）
//   ・--debug-crops N で、最初のN枚の切り出し画像を scripts/attr-eval-crops/ に保存（切り出し位置の確認用）
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CLIPVisionModelWithProjection, AutoProcessor, RawImage } from '@huggingface/transformers';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(DIR, '.attr-eval-cache.json');

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const LIMIT = parseInt(arg('limit', '1500'), 10);
const TYPES = arg('types', 'score_attack,score_attack_ex,seraph').split(',');
const DEBUG_CROPS = parseInt(arg('debug-crops', '0'), 10);

// ===== 切り出し位置（16:9 の画面に対する割合）。画面の作りがイベントの種類で違うので分ける =====
//  スコアアタック・EX：中央に大きなMVPの立ち絵、左に斜めに並ぶ6人の顔（1920×1080 の画面で合わせた）
//  遭遇戦：中央左の大きな円の中にMVPの立ち絵、左端に小さな6人の顔が縦に並ぶ
const LAYOUTS = {
  score_attack: {
    mvp: { x0: 0.25, y0: 0.02, x1: 0.66, y1: 0.62 },
    icons: [[0.094, 0.185], [0.064, 0.298], [0.048, 0.417], [0.047, 0.539], [0.058, 0.657], [0.086, 0.776]],
    r: 0.034, // 顔アイコンの半径（高さに対する割合。役割の札の文字は入れない）
  },
  seraph: {
    mvp: { x0: 0.21, y0: 0.18, x1: 0.51, y1: 0.78 },
    icons: [[0.095, 0.170], [0.068, 0.292], [0.055, 0.418], [0.052, 0.540], [0.062, 0.682], [0.090, 0.800]],
    r: 0.032,
  },
};
LAYOUTS.score_attack_ex = LAYOUTS.score_attack;
const LAYOUT_VERSION = 2; // 切り出し位置を変えたら上げる（キャッシュを作り直す）

// 画面の比率が16:9と違う場合は、中央の16:9の範囲を画面とみなす
function contentBox(W, H) {
  const ratio = W / H;
  if (ratio > 16 / 9 + 0.01) { const cw = H * 16 / 9; return { x: (W - cw) / 2, y: 0, w: cw, h: H }; }
  if (ratio < 16 / 9 - 0.01) { const ch = W * 9 / 16; return { x: 0, y: (H - ch) / 2, w: W, h: ch }; }
  return { x: 0, y: 0, w: W, h: H };
}
const aspectLabel = (W, H) => {
  const r = W / H;
  if (Math.abs(r - 16 / 9) < 0.03) return '16:9';
  if (r > 16 / 9) return '横長(>16:9)';
  if (Math.abs(r - 4 / 3) < 0.05) return '4:3';
  return 'その他';
};

// Cloudinary の画像は幅1280に縮めて取ってくる（転送量を減らす）
const sizedUrl = url => (url.includes('res.cloudinary.com') ? url.replace(/\/upload\/(?:[^/]+\/)?(v\d+\/)/, '/upload/w_1280,c_limit/$1') : url);

const normalize = v => { let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1; return Array.from(v, x => x / s); };
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

async function main() {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL を設定してください'); process.exit(1); }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
  const { rows } = await pool.query(
    `SELECT s.id, s.user_id, s.attribute, s.approved_image_url AS url, e.event_type, e.event_number
     FROM scores s JOIN events e ON e.id = s.event_id
     WHERE s.approved_score IS NOT NULL AND s.approved_image_url IS NOT NULL AND e.event_type = ANY($1)
     ORDER BY s.id DESC LIMIT $2`,
    [TYPES, LIMIT]
  );
  await pool.end();
  console.log(`対象: ${rows.length}件（種類: ${TYPES.join(', ')}）`);

  const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};
  const todo = rows.filter(r => !cache[r.id] || (cache[r.id].layoutVersion || 1) !== LAYOUT_VERSION && r.event_type === 'seraph');
  if (todo.length) {
    console.log(`画像を変換します: ${todo.length}件（変換済み ${rows.length - todo.length}件は再利用）`);
    const processor = await AutoProcessor.from_pretrained('Xenova/clip-vit-base-patch32');
    const model = await CLIPVisionModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch32', { dtype: 'q8' });
    const embed = async img => normalize((await model(await processor(img))).image_embeds.data);
    if (DEBUG_CROPS) fs.mkdirSync(path.join(DIR, 'attr-eval-crops'), { recursive: true });
    let done = 0, failed = 0;
    for (const r of todo) {
      try {
        const res = await fetch(sizedUrl(r.url));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const img = await RawImage.fromBlob(await res.blob());
        const c = contentBox(img.width, img.height);
        const box = (x0, y0, x1, y1) => [Math.round(c.x + x0 * c.w), Math.round(c.y + y0 * c.h), Math.round(c.x + x1 * c.w), Math.round(c.y + y1 * c.h)];
        const L = LAYOUTS[r.event_type] || LAYOUTS.score_attack;
        const mvpImg = await img.crop(box(L.mvp.x0, L.mvp.y0, L.mvp.x1, L.mvp.y1));
        const iconImgs = [];
        for (const [cx, cy] of L.icons) {
          const rr = L.r * c.h, x = c.x + cx * c.w, y = c.y + cy * c.h;
          iconImgs.push(await img.crop([Math.round(x - rr), Math.round(y - rr), Math.round(x + rr), Math.round(y + rr)]));
        }
        if (done < DEBUG_CROPS || (DEBUG_CROPS && r.event_type === 'seraph' && done < DEBUG_CROPS * 3)) {
          const d = path.join(DIR, 'attr-eval-crops');
          await mvpImg.save(path.join(d, `${r.id}_mvp.png`));
          for (const [k, im] of iconImgs.entries()) await im.save(path.join(d, `${r.id}_icon${k}.png`));
        }
        const mvp = await embed(mvpImg);
        const icons = [];
        for (const im of iconImgs) icons.push(await embed(im));
        cache[r.id] = { mvp, icons, aspect: aspectLabel(img.width, img.height), layoutVersion: LAYOUT_VERSION };
      } catch (err) {
        failed++;
        console.warn(`  失敗 id=${r.id}: ${err.message}`);
      }
      done++;
      if (done % 50 === 0) {
        console.log(`  ${done}/${todo.length}`);
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
      }
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
    console.log(`変換完了（失敗 ${failed}件）`);
  }

  // 役割の読み取り結果（attr-eval-roles.mjs）と、投稿ミスだった属性の付け直し（実験の中だけで使う）
  const rolesFile = path.join(DIR, '.attr-eval-roles.json'), fixesFile = path.join(DIR, '.attr-eval-fixes.json');
  const roles = fs.existsSync(rolesFile) ? JSON.parse(fs.readFileSync(rolesFile, 'utf8')) : {};
  const fixes = fs.existsSync(fixesFile) ? JSON.parse(fs.readFileSync(fixesFile, 'utf8')) : {};
  const items = rows.filter(r => cache[r.id]).map(r => ({
    ...r, ...cache[r.id],
    attribute: fixes[r.id] || r.attribute,
    roles: roles[r.id]?.roles?.length === 6 ? roles[r.id].roles : null,
  }));
  if (Object.keys(fixes).length) console.log(`属性の付け直し: ${Object.keys(fixes).length}件`);
  evaluate(items);
  if (items.some(it => it.roles)) evaluateAdm(items);
}

// 編成の重なり：iの6人それぞれについて、jの6人の中に十分似た顔がいれば1人と数える（並び順は無視）
function teamOverlap(a, b, tIcon) {
  let n = 0;
  for (const x of a.icons) if (b.icons.some(y => dot(x, y) >= tIcon)) n++;
  return n;
}

function predict(i, items, { tMvp, share1, tIcon, minTeam, share2, excludeSameUser }) {
  const me = items[i];
  const nbrs = [];
  for (let j = 0; j < items.length; j++) {
    if (j === i) continue;
    const o = items[j];
    if (excludeSameUser && o.user_id === me.user_id) continue;
    const s = dot(me.mvp, o.mvp);
    if (s >= tMvp) nbrs.push({ o, s });
  }
  if (!nbrs.length) return { pred: null, why: 'MVPの似た投稿なし' };
  const vote = list => {
    const v = {};
    for (const { o, s } of list) v[o.attribute] = (v[o.attribute] || 0) + s;
    const total = Object.values(v).reduce((a, b) => a + b, 0);
    const [top, w] = Object.entries(v).sort((a, b) => b[1] - a[1])[0];
    return { top, share: w / total, v };
  };
  const v1 = vote(nbrs);
  if (v1.share >= share1) return { pred: v1.top, step: 'MVP', votes: v1.v, n: nbrs.length };
  // MVPだけでは割れる → 編成が重なる投稿に絞る
  const team = nbrs.filter(({ o }) => teamOverlap(me, o, tIcon) >= minTeam);
  if (!team.length) return { pred: null, why: 'MVPで割れ、編成の近い投稿なし', votes: v1.v };
  const v2 = vote(team);
  if (v2.share >= share2) return { pred: v2.top, step: 'MVP+編成', votes: v2.v, n: team.length };
  return { pred: null, why: '編成で絞っても割れた', votes: v2.v };
}

function evaluate(items) {
  console.log(`\n評価: ${items.length}件（1件ずつ、自分以外の投稿から当てる）`);
  const base = { share1: 0.75, tIcon: 0.9, minTeam: 4, share2: 0.6 };
  const grid = [0.88, 0.91, 0.94, 0.96];
  for (const excludeSameUser of [false, true]) {
    console.log(`\n■ ${excludeSameUser ? '同じユーザーの投稿は使わない（初めての人を想定した厳しめの値）' : '全ての投稿を使う'}`);
    console.log('  MVPの類似しきい値 | 判定した割合 | 判定した中の正解率 | 全体の正解率');
    for (const tMvp of grid) {
      let predicted = 0, correct = 0;
      for (let i = 0; i < items.length; i++) {
        const r = predict(i, items, { ...base, tMvp, excludeSameUser });
        if (r.pred) { predicted++; if (r.pred === items[i].attribute) correct++; }
      }
      const pct = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '-');
      console.log(`  ${tMvp.toFixed(2)}              | ${pct(predicted, items.length).padStart(6)}     | ${pct(correct, predicted).padStart(6)}           | ${pct(correct, items.length)}`);
    }
  }

  // 真ん中のしきい値で、比率・種類ごとの内訳と、外れた投稿の一覧を出す
  const opt = { ...base, tMvp: 0.91, excludeSameUser: false };
  const by = {};
  const misses = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const r = predict(i, items, opt);
    for (const key of [`比率 ${it.aspect}`, `種類 ${it.event_type}`, `判定 ${r.step || '判定なし'}`]) {
      by[key] = by[key] || { n: 0, p: 0, c: 0 };
      by[key].n++;
      if (r.pred) { by[key].p++; if (r.pred === it.attribute) by[key].c++; }
    }
    if (r.pred && r.pred !== it.attribute) misses.push({ it, r });
  }
  console.log('\n■ 内訳（しきい値 0.91）  件数 / 判定した件数 / 正解');
  for (const [k, v] of Object.entries(by).sort()) console.log(`  ${k.padEnd(22)} ${v.n} / ${v.p} / ${v.c}`);
  const csv = ['id,event_number,正解,推定,判定,票,画像URL', ...misses.map(({ it, r }) =>
    [it.id, it.event_number, it.attribute, r.pred, r.step, JSON.stringify(Object.fromEntries(Object.entries(r.votes).map(([k, w]) => [k, +w.toFixed(2)]))).replace(/,/g, ' '), it.url].join(','))];
  fs.writeFileSync(path.join(DIR, 'attr-eval-misses.csv'), '﻿' + csv.join('\n'));
  console.log(`\n外れた投稿 ${misses.length}件を scripts/attr-eval-misses.csv に出しました`);
}

// ===== ADM を使う判定（役割の読み取り結果があるとき） =====
// ① MVPの立ち絵で多数決 → ② 割れたらADMの顔で判定（ADMの顔どうしを全投稿で比べ、その属性で多数決）
// ③ ADMはいるが決まらない（汎用ADMなど） / ④ ADMがいない → 参考として編成の重なりでも判定してみる
const undecidedNoAdm = [];
function evaluateAdm(items) {
  const withRoles = items.filter(it => it.roles);
  console.log(`\n\n========== ADMを使う判定（役割を読めた ${withRoles.length}件 / ${items.length}件） ==========`);
  // 共通の特徴（紫の枠・アニメ調の顔など）を差し引くため、顔アイコンの平均を引いてから正規化する
  const dim = items[0].icons[0].length, mean = new Array(dim).fill(0);
  let cnt = 0;
  for (const it of items) for (const v of it.icons) { for (let d = 0; d < dim; d++) mean[d] += v[d]; cnt++; }
  for (let d = 0; d < dim; d++) mean[d] /= cnt;
  for (const it of items) it.iconsC = it.icons.map(v => normalize(v.map((x, d) => x - mean[d])));
  // 同じ画像の別キャラどうしの類似度から、「同じキャラ」とみなす基準を決める（上位1%の値）
  const within = [];
  for (const it of items) for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) within.push(dot(it.iconsC[a], it.iconsC[b]));
  within.sort((x, y) => x - y);
  const tC = within[Math.floor(within.length * 0.99)];
  const ADM_T = process.env.ADM_T ? parseFloat(process.env.ADM_T) : tC; // ADMの顔を「同じ」とみなす基準（試算用に変えられる）
  console.log(`共通の特徴を引いた後の、別キャラどうしの類似度：中央値 ${within[Math.floor(within.length / 2)].toFixed(3)} ／ 上位1% ${tC.toFixed(3)}（これを「同じキャラ」の基準にする）`);

  const admIdx = it => (it.roles ? it.roles.indexOf('ADM') : -1);
  const vote = list => {
    const v = {};
    for (const { o, s } of list) v[o.attribute] = (v[o.attribute] || 0) + s;
    const total = Object.values(v).reduce((a, b) => a + b, 0);
    if (!total) return null;
    const [top, w] = Object.entries(v).sort((a, b) => b[1] - a[1])[0];
    return { top, share: w / total, v };
  };
  // ADMの顔で判定：自分のADMの顔と、他の投稿のADMの顔を比べ、似ている上位で多数決
  const admPredict = (i, excludeSameUser) => {
    const me = items[i], ai = admIdx(me);
    if (ai < 0) return null;
    const cands = [];
    for (let j = 0; j < items.length; j++) {
      if (j === i) continue;
      const o = items[j];
      if (excludeSameUser && o.user_id === me.user_id) continue;
      const aj = admIdx(o);
      if (aj < 0) continue;
      const s = dot(me.iconsC[ai], o.iconsC[aj]);
      if (s >= ADM_T) cands.push({ o, s });
    }
    cands.sort((a, b) => b.s - a.s);
    const v = vote(cands.slice(0, 15));
    if (!v || cands.length < 2) return { pred: null, n: cands.length };
    return { pred: v.share >= 0.8 ? v.top : null, share: v.share, n: cands.length, votes: v.v };
  };
  // 編成の重なり（参考）。mode: raw=今の方法 / centered=共通の特徴を引く / role=共通の特徴を引いて同じ役割どうしだけ比べる
  const overlap = (a, b, mode) => {
    let n = 0;
    for (let x = 0; x < 6; x++) {
      let hit = false;
      for (let y = 0; y < 6; y++) {
        if (mode === 'role' && (!a.roles || !b.roles || a.roles[x] !== b.roles[y])) continue;
        const s = mode === 'raw' ? dot(a.icons[x], b.icons[y]) : dot(a.iconsC[x], b.iconsC[y]);
        if (s >= (mode === 'raw' ? 0.9 : tC)) { hit = true; break; }
      }
      if (hit) n++;
    }
    return n;
  };
  // メンバーごとの属性の傾向を合算する：自分の6人それぞれについて、同じ役割で顔が似ている他の投稿のメンバーを集め、
  // その投稿の属性の分布を作る。6人分の分布を足し合わせて一番多い属性を推定（汎用メンバーは分布が平らなので効きにくい）
  const ATTRS = ['火', '氷', '雷', '光', '闇', '無'];
  const memberPredict = (i, excludeSameUser) => {
    const me = items[i];
    if (!me.roles) return null;
    const total = Object.fromEntries(ATTRS.map(a => [a, 0]));
    let used = 0;
    for (let x = 0; x < 6; x++) {
      const dist = Object.fromEntries(ATTRS.map(a => [a, 0]));
      let n = 0;
      for (let j = 0; j < items.length; j++) {
        if (j === i) continue;
        const o = items[j];
        if (!o.roles || (excludeSameUser && o.user_id === me.user_id)) continue;
        for (let y = 0; y < 6; y++) {
          if (o.roles[y] !== me.roles[x]) continue;
          if (dot(me.iconsC[x], o.iconsC[y]) >= ADM_T) { if (dist[o.attribute] !== undefined) { dist[o.attribute]++; n++; } break; }
        }
      }
      if (n < 3) continue; // 例が少ないメンバーは使わない
      used++;
      // 偏りの強いメンバーほど効くように、分布を2乗してから正規化して足す
      const sq = ATTRS.map(a => (dist[a] / n) ** 2), sum = sq.reduce((p, q) => p + q, 0);
      ATTRS.forEach((a, k) => { total[a] += sq[k] / sum; });
    }
    if (used < 2) return { pred: null, used };
    const sumT = Object.values(total).reduce((p, q) => p + q, 0);
    const [top, w] = Object.entries(total).sort((p, q) => q[1] - p[1])[0];
    return { pred: w / sumT >= 0.6 ? top : null, share: w / sumT, used };
  };

  const mvpNeighbors = (i, excludeSameUser) => {
    const me = items[i], out = [];
    for (let j = 0; j < items.length; j++) {
      if (j === i) continue;
      const o = items[j];
      if (excludeSameUser && o.user_id === me.user_id) continue;
      const s = dot(me.mvp, o.mvp);
      if (s >= 0.91) out.push({ o, s });
    }
    return out;
  };

  for (const excludeSameUser of [false, true]) {
    console.log(`\n■ ${excludeSameUser ? '同じユーザーの投稿は使わない（厳しめ）' : '全ての投稿を使う'}`);
    const cat = {};
    const add = (k, ok) => { cat[k] = cat[k] || { n: 0, p: 0, c: 0 }; cat[k].n++; if (ok !== null) { cat[k].p++; if (ok) cat[k].c++; } };
    const ref = {};
    const addRef = (k, mode, ok) => { const key = `${k} / ${mode}`; ref[key] = ref[key] || { p: 0, c: 0 }; if (ok !== null) { ref[key].p++; if (ok) ref[key].c++; } };
    let finalMvpFirst = { p: 0, c: 0 }, finalAdmFirst = { p: 0, c: 0 };
    const admAlone = { p: 0, c: 0 };
    const undecided = {};
    const memAll = { p: 0, c: 0 }, memUnd = { n: 0, p: 0, c: 0 }, finalC = { p: 0, c: 0 };
    const combo = {};
    const routes = {};
    const dualDetail = {};
    for (let i = 0; i < items.length; i++) {
      const me = items[i];
      if (!me.roles) continue;
      const nb = mvpNeighbors(i, excludeSameUser);
      const v1 = nb.length ? vote(nb) : null;
      const mvpPred = v1 && v1.share >= 0.75 ? v1.top : null;
      const adm = admPredict(i, excludeSameUser);
      if (adm && adm.pred) { admAlone.p++; if (adm.pred === me.attribute) admAlone.c++; }
      // 方針A：MVP優先（MVPで決まらないときだけADM）
      let predA = mvpPred, stepA;
      if (mvpPred) stepA = '① MVPで決定';
      else if (!nb.length) stepA = '判定なし（MVPの似た投稿なし）';
      else if (admIdx(me) >= 0 && adm.pred) { predA = adm.pred; stepA = '② MVPで割れ→ADMで決定'; }
      else if (admIdx(me) >= 0) stepA = '③ MVPで割れ→ADMで決まらず（汎用ADMなど）';
      else stepA = '④ MVPで割れ→ADMなし';
      add(stepA, predA ? predA === me.attribute : null);
      if (predA) { finalMvpFirst.p++; if (predA === me.attribute) finalMvpFirst.c++; }
      // 方針B：ADM優先（ADMで決まればそれ、決まらなければMVP）
      const predB = (adm && adm.pred) || mvpPred;
      const mem = memberPredict(i, excludeSameUser);
      if (mem && mem.pred) { memAll.p++; if (mem.pred === me.attribute) memAll.c++; }
      if (!predB) { memUnd.n++; if (mem && mem.pred) { memUnd.p++; if (mem.pred === me.attribute) memUnd.c++; } }
      const predC = predB || (mem && mem.pred);
      // 3つの手がかりの組み合わせ方の比較
      const sig = [adm && adm.pred, mvpPred, mem && mem.pred].filter(Boolean);
      const cntBy = {}; sig.forEach(a => { cntBy[a] = (cntBy[a] || 0) + 1; });
      const [mTop, mN] = Object.entries(cntBy).sort((a, b) => b[1] - a[1])[0] || [null, 0];
      const combos = {
        'ADMだけ': adm && adm.pred,
        'MVPだけ': mvpPred,
        '編成だけ': mem && mem.pred,
        '方針B（ADM→MVP）': predB,
        '方針C（ADM→MVP→編成）': predC,
        '2つ以上が一致したら（多数決）': mN >= 2 ? mTop : null,
        '出た結果が全部一致（2つ以上）': sig.length >= 2 && mN === sig.length ? mTop : null,
        '3つ全部が一致': sig.length === 3 && mN === 3 ? mTop : null,
      };
      for (const [k, v] of Object.entries(combos)) { combo[k] = combo[k] || { p: 0, c: 0 }; if (v) { combo[k].p++; if (v === me.attribute) combo[k].c++; } }
      // 最終案の振り分け：確定（2つ以上一致）／参考（1つだけ・割れた）／判定なし。
      // MVPが2属性スタイル（同じMVPの投稿の属性が、1割5分以上の属性を2つ以上含む）で「参考」なら、一致していても手動へ
      const dual = v1 ? Object.values(v1.v).filter(w => w / Object.values(v1.v).reduce((a, b) => a + b, 0) >= 0.15).length >= 2 : false;
      const sure = mN >= 2 ? mTop : null;
      const single = !sure && sig.length ? (adm && adm.pred) || mvpPred || (mem && mem.pred) : null;
      let route;
      if (sure) route = sure === me.attribute ? '確定・一致 → 自動承認' : '確定・不一致 → 手動';
      else if (single && dual) {
        // MVPが2属性：MVP以外の手がかり（ADMか編成）が1つ決まり、それがMVPの候補（1割5分以上の属性）に入っていればOK
        const totalV = Object.values(v1.v).reduce((a, b) => a + b, 0);
        const candidates = Object.entries(v1.v).filter(([, w]) => w / totalV >= 0.15).map(([a]) => a);
        const other = (adm && adm.pred) || (mem && mem.pred);
        const conflict = sig.length >= 2;
        if (!other || conflict) route = '参考・MVPが2属性（他の手がかりなし・食い違い）→ 手動';
        else if (!candidates.includes(other)) route = '参考・MVPが2属性（他の手がかりが候補外）→ 手動';
        else route = other === me.attribute ? '参考・MVPが2属性＋他の手がかり・一致 → 自動承認' : '参考・MVPが2属性＋他の手がかり・不一致 → 手動';
      }
      else if (single) route = single === me.attribute ? '参考・一致 → 自動承認' : '参考・不一致 → 手動';
      else route = '判定なし → 手動';
      if (route.startsWith('参考・MVPが2属性')) {
        const parts = [['ADM', adm && adm.pred], ['MVP', mvpPred], ['編成', mem && mem.pred]].filter(([, v]) => v);
        const key = parts.length === 1 ? `${parts[0][0]}だけ決まった` : `${parts.map(([n, v]) => n + '=' + v).join('・')}で食い違い`;
        const k2 = parts.length === 1 ? key : '2つ以上決まったが食い違い';
        dualDetail[k2] = (dualDetail[k2] || 0) + 1;
      }
      routes[route] = routes[route] || { n: 0, wrong: 0 };
      routes[route].n++;
      // 自動承認に回ったのに、AIの推定が実は外れていた（＝属性ミスを見逃しうる）件数
      const usedPred = sure || (dual && single ? ((adm && adm.pred) || (mem && mem.pred)) : single);
      if (route.endsWith('自動承認') && usedPred !== me.attribute) routes[route].wrong++;
      if (predC) { finalC.p++; if (predC === me.attribute) finalC.c++; }
      if (predB) { finalAdmFirst.p++; if (predB === me.attribute) finalAdmFirst.c++; }
      else {
        // 方針Bで判定できなかった理由
        const admState = admIdx(me) < 0 ? 'ADMなし' : !adm || adm.n < 2 ? 'ADMの似た顔なし（新しいADM・切り出しずれ）' : 'ADMで票が割れた（汎用ADMなど）';
        const mvpState = !nb.length ? 'MVPの似た投稿なし（新しいスタイル・切り出しずれ）' : 'MVPで票が割れた（複数属性スタイルなど）';
        const key = `${admState} × ${mvpState}`;
        undecided[key] = (undecided[key] || 0) + 1;
        if (!excludeSameUser && admState.startsWith('ADMの似た顔なし')) undecidedNoAdm.push({ id: me.id, url: me.url, adm: admIdx(me), roles: me.roles.join(' '), aspect: me.aspect, type: me.event_type });
      }
      // ③④の参考：編成の重なりで判定してみる
      if (stepA.startsWith('③') || stepA.startsWith('④')) {
        const k = stepA.slice(0, 1);
        for (const mode of ['raw', 'centered', 'role']) {
          const team = nb.filter(({ o }) => overlap(me, o, mode) >= 4);
          const v2 = team.length ? vote(team) : null;
          const pred = v2 && v2.share >= 0.6 ? v2.top : null;
          addRef(k, mode, pred ? pred === me.attribute : null);
        }
      }
    }
    const pct = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '-');
    console.log('  区分                                   件数 / 判定 / 正解（正解率）');
    for (const [k, v] of Object.entries(cat).sort()) console.log(`  ${k.padEnd(34)} ${String(v.n).padStart(4)} / ${String(v.p).padStart(4)} / ${String(v.c).padStart(4)}（${pct(v.c, v.p)}）`);
    const total = items.filter(it => it.roles).length;
    console.log(`  方針A（MVP優先）：判定 ${pct(finalMvpFirst.p, total)}・判定した中の正解率 ${pct(finalMvpFirst.c, finalMvpFirst.p)}・全体の正解率 ${pct(finalMvpFirst.c, total)}`);
    console.log(`  方針B（ADM優先）：判定 ${pct(finalAdmFirst.p, total)}・判定した中の正解率 ${pct(finalAdmFirst.c, finalAdmFirst.p)}・全体の正解率 ${pct(finalAdmFirst.c, total)}`);
    console.log(`  （参考）ADMだけで判定した場合：判定 ${admAlone.p}件・正解率 ${pct(admAlone.c, admAlone.p)}`);
    console.log(`  （参考）編成のメンバーの傾向だけで判定した場合：判定 ${memAll.p}件・正解率 ${pct(memAll.c, memAll.p)}`);
    console.log(`  方針Bで判定できなかった ${memUnd.n}件を、編成のメンバーの傾向で判定：判定 ${memUnd.p}件・正解 ${memUnd.c}件（${pct(memUnd.c, memUnd.p)}）`);
    console.log(`  方針C（ADM → MVP → 編成）：判定 ${pct(finalC.p, total)}・判定した中の正解率 ${pct(finalC.c, finalC.p)}・全体の正解率 ${pct(finalC.c, total)}`);
    console.log('  ◆ 組み合わせ方の比較：判定できた割合 / 判定した中の正解率 / 外れた件数');
    for (const [k, v] of Object.entries(combo)) console.log(`    ${k.padEnd(24)} ${pct(v.p, total).padStart(6)} / ${pct(v.c, v.p).padStart(6)} / ${v.p - v.c}件`);
    console.log('  ◆ 最終案の振り分け（件数）');
    for (const [k, v] of Object.entries(routes).sort()) console.log(`    ${k.padEnd(40)} ${String(v.n).padStart(4)}件（${pct(v.n, total)}）`);
    const manual = Object.entries(routes).filter(([k]) => k.endsWith('手動')).reduce((a, [, v]) => a + v.n, 0);
    console.log(`    → 自動承認 ${pct(total - manual, total)} ／ 手動 ${pct(manual, total)}`);
    console.log('  ◆「参考・MVPが2属性」の内訳', JSON.stringify(dualDetail));
    console.log('  方針Bで判定できなかった理由：');
    for (const [k, v] of Object.entries(undecided).sort((a, b) => b[1] - a[1])) console.log(`    ${v}件  ${k}`);
    console.log(`    ${items.length - items.filter(it => it.roles).length}件  役割を読み取れなかった（評価の対象外）`);
    console.log('  （参考）③④を編成の重なりで判定した場合  判定 / 正解（正解率）');
    for (const [k, v] of Object.entries(ref).sort()) console.log(`    ${k.padEnd(14)} ${String(v.p).padStart(4)} / ${String(v.c).padStart(4)}（${pct(v.c, v.p)}）`);
  }
}

process.on('exit', () => { if (undecidedNoAdm.length) fs.writeFileSync(path.join(DIR, 'attr-eval-noadm.json'), JSON.stringify(undecidedNoAdm)); });
main().catch(err => { console.error(err); process.exit(1); });
