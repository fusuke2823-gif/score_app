// リザルト画像からの属性の自動判定。
//
// 学習はせず、過去の承認済み投稿（お手本）と「似ているもの」を探して、その属性で多数決する。手がかりは3つ：
//   ADM  … 編成にいるADMの顔（属性ADMならほぼ確定、汎用ADMは票がばらけて決まらない）
//   MVP  … 中央のMVPの立ち絵
//   編成 … 6人の顔と役割から、メンバーごとに「どの属性の編成によく入るか」を合算（並び順は無視）
// 画像の特徴の数値は画像認識モデル（CLIP）で出す。お手本は score_vectors に画像URLをキーに保存し、
// 属性は承認済みスコアの属性をその都度参照する（属性を修正すればお手本も正しくなる）。
// 振り分けのルール・数値は scripts/attr-eval.mjs の実験（承認済み1233件）で決めたもの。
const pool = require('../db/index');

const VERSION = 1;
const ATTRS = ['火', '氷', '雷', '光', '闇', '無'];
const DIM = 512;

// ===== 判定の数値（実験で決めた値） =====
const T_MVP = 0.91;      // MVPの立ち絵を「似ている」とみなす類似度
const SHARE_MVP = 0.75;  // MVPで決まるのに必要な票の割合
const T_FACE = 0.65;     // 顔（共通の特徴を引いた後）を「同じキャラ」とみなす類似度
const SHARE_ADM = 0.8;   // ADMで決まるのに必要な票の割合（似ている上位15件で多数決）
const ADM_MARGIN = 0.05; // ADMは一番似ている顔から、この差以内のものだけで多数決（少し似ているだけの別のADMが大量に混ざるのを防ぐ）
const SHARE_MEMBER = 0.6;
const DUAL_SHARE = 0.15; // MVPの票で、この割合以上の属性が2つ以上あれば「2属性スタイル」
const ADM_LOOSE_K = 5, ADM_LOOSE_MIN = 0.5; // ADMの似た顔が基準に届かなくても、上位5件（0.5以上）が全部同じ属性なら決める（小さくぼやけた顔向け）

// ===== 切り出し位置（16:9 の画面に対する割合）。スコアアタック・EX と遭遇戦で画面の作りが違う =====
const LAYOUTS = {
  score_attack: {
    mvp: { x0: 0.25, y0: 0.02, x1: 0.66, y1: 0.62 },
    icons: [[0.094, 0.185], [0.064, 0.298], [0.048, 0.417], [0.047, 0.539], [0.058, 0.657], [0.086, 0.776]],
    r: 0.034,
  },
  seraph: {
    mvp: { x0: 0.21, y0: 0.18, x1: 0.51, y1: 0.78 },
    icons: [[0.095, 0.170], [0.068, 0.292], [0.055, 0.418], [0.052, 0.540], [0.062, 0.682], [0.090, 0.800]],
    r: 0.032,
  },
};
LAYOUTS.score_attack_ex = LAYOUTS.score_attack;

// 画面の比率が16:9と違う場合は、中央の16:9の範囲を画面とみなす
function contentBox(W, H) {
  const ratio = W / H;
  if (ratio > 16 / 9 + 0.01) { const cw = H * 16 / 9; return { x: (W - cw) / 2, y: 0, w: cw, h: H }; }
  if (ratio < 16 / 9 - 0.01) { const ch = W * 9 / 16; return { x: 0, y: (H - ch) / 2, w: W, h: ch }; }
  return { x: 0, y: 0, w: W, h: H };
}

// 実験と同じ条件にするため、Cloudinary の画像は幅1280以内に縮めたものを使う
const sizedUrl = url => (url.includes('res.cloudinary.com') ? url.replace(/\/upload\/(?:[^/]+\/)?(v\d+\/)/, '/upload/w_1280,c_limit/$1') : url);

const normalize = v => {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / s;
  return out;
};
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const toBytes = arr => Buffer.from(new Float32Array(arr).buffer);
const fromBytes = buf => new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

// ===== 画像認識モデル：必要なときだけ読み込み、しばらく使わなければ解放する（メモリ節約） =====
const IDLE_MS = 10 * 60 * 1000;
let _model = null, _loading = null, _idleTimer = null, _queue = Promise.resolve();

async function getModel() {
  if (_model) return _model;
  if (!_loading) {
    _loading = (async () => {
      const { CLIPVisionModelWithProjection, AutoProcessor, RawImage } = require('@huggingface/transformers');
      const processor = await AutoProcessor.from_pretrained('Xenova/clip-vit-base-patch32');
      const model = await CLIPVisionModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch32', { dtype: 'q8' });
      _model = { processor, model, RawImage };
      return _model;
    })().finally(() => { _loading = null; });
  }
  return _loading;
}
function touchIdle() {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(async () => {
    const m = _model;
    _model = null;
    try { await m?.model?.dispose?.(); } catch {}
  }, IDLE_MS);
  if (_idleTimer.unref) _idleTimer.unref();
}

// 画像URLから、MVPの立ち絵と6人の顔の特徴の数値を出す（同時に1件ずつ処理してメモリの山を作らない）
//   layoutType … 画面の種類（Geminiが画像から読んだ種類を優先。MVPの切り出し位置を決める）
//   boxes      … Geminiが返した6人の顔の位置 [ymin, xmin, ymax, xmax]（0〜1000）。無ければ固定の位置で切り出す
function computeVectors(imageUrl, layoutType, boxes = null) {
  const job = _queue.then(async () => {
    const { processor, model, RawImage } = await getModel();
    touchIdle();
    const res = await fetch(sizedUrl(imageUrl));
    if (!res.ok) throw new Error(`image HTTP ${res.status}`);
    const img = await RawImage.fromBlob(await res.blob());
    const c = contentBox(img.width, img.height);
    const L = LAYOUTS[layoutType] || LAYOUTS.score_attack;
    const embed = async im => normalize((await model(await processor(im))).image_embeds.data);
    const box = (x0, y0, x1, y1) => [Math.round(c.x + x0 * c.w), Math.round(c.y + y0 * c.h), Math.round(c.x + x1 * c.w), Math.round(c.y + y1 * c.h)];
    const mvp = await embed(await img.crop(box(L.mvp.x0, L.mvp.y0, L.mvp.x1, L.mvp.y1)));
    const icons = [];
    if (boxes && boxes.length === 6) {
      // 顔の矩形の中心から、短い辺の長さ×0.9の正方形で切り出す（札の文字が入りにくいように）
      for (const [y0, x0, y1, x1] of boxes) {
        const cx = (x0 + x1) / 2000 * img.width, cy = (y0 + y1) / 2000 * img.height;
        const rr = Math.max(2, Math.min((x1 - x0) / 1000 * img.width, (y1 - y0) / 1000 * img.height) / 2 * 0.9);
        icons.push(await embed(await img.crop([Math.round(cx - rr), Math.round(cy - rr), Math.round(cx + rr), Math.round(cy + rr)])));
      }
    } else {
      for (const [cx, cy] of L.icons) {
        const rr = L.r * c.h, x = c.x + cx * c.w, y = c.y + cy * c.h;
        icons.push(await embed(await img.crop([Math.round(x - rr), Math.round(y - rr), Math.round(x + rr), Math.round(y + rr)])));
      }
    }
    return { mvp, icons };
  });
  _queue = job.catch(() => {});
  return job;
}

async function saveVectors(db, { imageUrl, scoreId, eventType, roles, mvp, icons }) {
  const flat = new Float32Array(icons.length * DIM);
  icons.forEach((v, k) => flat.set(v, k * DIM));
  await db.query(
    `INSERT INTO score_vectors (image_url, score_id, event_type, roles, mvp, icons)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (image_url) DO UPDATE SET score_id = $2, event_type = $3, roles = $4, mvp = $5, icons = $6`,
    [imageUrl, scoreId, eventType, roles, toBytes(mvp), Buffer.from(flat.buffer)]
  );
  _refsCheckedAt = 0; // 次の判定でお手本を読み直す
}

// ===== お手本（承認済み投稿の特徴の数値）をメモリに持つ。数値は一度読めば使い回し、属性などの軽い情報だけ読み直す =====
let _vecCache = new Map(); // image_url → { mvp, icons, iconsC, roles }
let _refs = [];            // [{ url, attribute, userId, scoreId, eventId, v }]
let _mean = null, _meanCount = -1, _refsCheckedAt = 0;
const REFS_TTL = 60 * 1000;

async function loadRefs(db = pool) {
  if (Date.now() - _refsCheckedAt < REFS_TTL && _refs.length) return _refs;
  const { rows } = await db.query(
    `SELECT v.image_url, s.id AS score_id, s.event_id, s.user_id, s.attribute
     FROM score_vectors v JOIN scores s ON s.approved_image_url = v.image_url
     WHERE s.approved_score IS NOT NULL AND v.excluded = FALSE AND v.roles IS NOT NULL`
  );
  const missing = rows.map(r => r.image_url).filter(u => !_vecCache.has(u));
  for (let i = 0; i < missing.length; i += 200) {
    const part = await db.query('SELECT image_url, roles, mvp, icons FROM score_vectors WHERE image_url = ANY($1)', [missing.slice(i, i + 200)]);
    for (const r of part.rows) {
      const flat = fromBytes(r.icons);
      _vecCache.set(r.image_url, { mvp: fromBytes(r.mvp), icons: Array.from({ length: 6 }, (_, k) => flat.subarray(k * DIM, (k + 1) * DIM)), roles: r.roles });
    }
  }
  const alive = new Set(rows.map(r => r.image_url));
  for (const u of _vecCache.keys()) if (!alive.has(u)) _vecCache.delete(u);
  _refs = rows.filter(r => _vecCache.has(r.image_url)).map(r => ({ url: r.image_url, attribute: r.attribute, userId: r.user_id, scoreId: r.score_id, eventId: r.event_id, v: _vecCache.get(r.image_url) }));
  // 顔の共通の特徴（紫の枠・アニメ調など）を引くための平均。お手本の数が変わったら計算し直す
  if (_meanCount !== _refs.length) {
    const mean = new Float32Array(DIM);
    let n = 0;
    for (const r of _refs) for (const ic of r.v.icons) { for (let d = 0; d < DIM; d++) mean[d] += ic[d]; n++; }
    if (n) for (let d = 0; d < DIM; d++) mean[d] /= n;
    _mean = mean;
    _meanCount = _refs.length;
    for (const v of _vecCache.values()) v.iconsC = null;
  }
  for (const r of _refs) if (!r.v.iconsC) r.v.iconsC = r.v.icons.map(centerFace);
  _refsCheckedAt = Date.now();
  return _refs;
}
const centerFace = v => { const out = new Float32Array(DIM); for (let d = 0; d < DIM; d++) out[d] = v[d] - (_mean ? _mean[d] : 0); return normalize(out); };

const voteOf = list => {
  const v = {};
  for (const { r, s } of list) v[r.attribute] = (v[r.attribute] || 0) + s;
  const total = Object.values(v).reduce((a, b) => a + b, 0);
  if (!total) return null;
  const [top, w] = Object.entries(v).sort((a, b) => b[1] - a[1])[0];
  return { top, share: w / total, votes: v, total };
};
const round = x => Math.round(x * 100) / 100;

// 1件の判定。target: { mvp, icons, roles, url }（url が同じお手本は除く＝自分自身と比べない）
// 返り値の signals に3つの手がかりの結果、tier に段階、pred に推定の属性
async function judgeVectors(target, { db = pool } = {}) {
  const refs = (await loadRefs(db)).filter(r => r.url !== target.url);
  const iconsC = target.icons.map(centerFace);
  const signals = {};

  // MVP
  const nb = [];
  for (const r of refs) { const s = dot(target.mvp, r.v.mvp); if (s >= T_MVP) nb.push({ r, s }); }
  const vm = voteOf(nb);
  signals.mvp = { pred: vm && vm.share >= SHARE_MVP ? vm.top : null, n: nb.length, share: vm ? round(vm.share) : null };
  const dualCands = vm ? Object.entries(vm.votes).filter(([, w]) => w / vm.total >= DUAL_SHARE).map(([a]) => a) : [];
  signals.mvp.candidates = dualCands;
  const dual = dualCands.length >= 2;

  // ADM
  const roles = target.roles || null;
  const ai = roles ? roles.indexOf('ADM') : -1;
  if (ai >= 0) {
    const cands = [];
    for (const r of refs) {
      const aj = r.v.roles.indexOf('ADM');
      if (aj < 0) continue;
      const s = dot(iconsC[ai], r.v.iconsC[aj]);
      if (s >= T_FACE) cands.push({ r, s });
    }
    if (!cands.length) {
      const loose = [];
      for (const r of refs) {
        const aj = r.v.roles.indexOf('ADM');
        if (aj < 0) continue;
        const s = dot(iconsC[ai], r.v.iconsC[aj]);
        if (s >= ADM_LOOSE_MIN) loose.push({ r, s });
      }
      loose.sort((a, b) => b.s - a.s);
      const top = loose.slice(0, ADM_LOOSE_K);
      if (top.length === ADM_LOOSE_K && top.every(x => x.r.attribute === top[0].r.attribute)) cands.push(...top);
    }
    cands.sort((a, b) => b.s - a.s);
    if (cands.length) { const best = cands[0].s; while (cands.length && cands[cands.length - 1].s < best - ADM_MARGIN) cands.pop(); }
    const va = cands.length >= 2 ? voteOf(cands.slice(0, 15)) : null;
    signals.adm = { pred: va && va.share >= SHARE_ADM ? va.top : null, n: cands.length, share: va ? round(va.share) : null };
  } else {
    signals.adm = { pred: null, n: 0, absent: true };
  }

  // 編成：メンバーごとに、同じ役割で顔が似ているお手本の属性の分布を作り、偏りの強いメンバーほど重く合算
  if (roles) {
    // お手本の属性ごとの件数（光・無は少ない）。件数の多い属性に票が寄りすぎないよう、半分の強さで補正する
    const prior = Object.fromEntries(ATTRS.map(a => [a, 0]));
    for (const r of refs) if (prior[r.attribute] !== undefined) prior[r.attribute]++;
    const total = Object.fromEntries(ATTRS.map(a => [a, 0]));
    let used = 0;
    for (let x = 0; x < 6; x++) {
      const dist = Object.fromEntries(ATTRS.map(a => [a, 0]));
      let n = 0;
      for (const r of refs) {
        for (let y = 0; y < 6; y++) {
          if (r.v.roles[y] !== roles[x]) continue;
          if (dot(iconsC[x], r.v.iconsC[y]) >= T_FACE) { if (dist[r.attribute] !== undefined) { dist[r.attribute]++; n++; } break; }
        }
      }
      if (n < 3) continue;
      used++;
      const adj = ATTRS.map(a => (prior[a] ? dist[a] / Math.sqrt(prior[a]) : 0)), adjSum = adj.reduce((p, q) => p + q, 0) || 1;
      const sq = adj.map(x => (x / adjSum) ** 2), sum = sq.reduce((p, q) => p + q, 0) || 1;
      ATTRS.forEach((a, k) => { total[a] += sq[k] / sum; });
    }
    const sumT = Object.values(total).reduce((p, q) => p + q, 0);
    const [top, w] = sumT ? Object.entries(total).sort((p, q) => q[1] - p[1])[0] : [null, 0];
    signals.member = { pred: used >= 2 && sumT && w / sumT >= SHARE_MEMBER ? top : null, used, share: sumT ? round(w / sumT) : null };
  } else {
    signals.member = { pred: null, used: 0 };
  }

  // 段階：2つ以上の手がかりが一致すれば確定、1つだけなら参考、食い違いや決まらないものは手動へ
  const preds = [signals.adm.pred, signals.mvp.pred, signals.member.pred].filter(Boolean);
  const cnt = {};
  preds.forEach(a => { cnt[a] = (cnt[a] || 0) + 1; });
  const [mTop, mN] = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0] || [null, 0];
  let tier, pred = null;
  if (mN >= 2) { tier = 'sure'; pred = mTop; }
  else if (preds.length >= 2) tier = 'conflict';
  else if (preds.length === 1) {
    if (dual) {
      const other = signals.adm.pred || signals.member.pred;
      if (!other) tier = 'dual_mvp_only';
      else if (!dualCands.includes(other)) tier = 'dual_out';
      else { tier = 'dual_other'; pred = other; }
    } else { tier = 'single'; pred = preds[0]; }
  } else tier = 'none';
  return { v: VERSION, tier, pred, dual, signals, refs: refs.length };
}

// 段階と投稿の属性から、自動承認してよいか（route）と、管理者向けのメモを決める
const SIGNAL_LABEL = { adm: 'ADM', mvp: 'MVP', member: '編成' };
function routeFor(result, submitted) {
  const agreeing = Object.entries(result.signals).filter(([, s]) => s.pred && s.pred === result.pred).map(([k]) => SIGNAL_LABEL[k]);
  const why = agreeing.length ? `（${agreeing.join('・')}で判定）` : '';
  switch (result.tier) {
    case 'sure':
    case 'single':
    case 'dual_other':
      if (result.pred === submitted) return { route: 'auto', reason: `match_${result.tier}`, note: null };
      return { route: 'manual', reason: `mismatch_${result.tier}`, note: `属性: AIの推定は${result.pred}${why}／投稿は${submitted}` };
    case 'dual_mvp_only':
      return { route: 'manual', reason: 'dual_mvp_only', note: `属性: MVPが2属性スタイル（${result.signals.mvp.candidates.join('・')}）で、他の手がかりで決まりませんでした` };
    case 'dual_out':
      return { route: 'manual', reason: 'dual_out', note: `属性: MVPの候補（${result.signals.mvp.candidates.join('・')}）と他の手がかり（${result.signals.adm.pred || result.signals.member.pred}）が食い違いました` };
    case 'conflict':
      return { route: 'manual', reason: 'conflict', note: `属性: 手がかりが食い違いました（${Object.entries(result.signals).filter(([, s]) => s.pred).map(([k, s]) => `${SIGNAL_LABEL[k]}:${s.pred}`).join('・')}）` };
    default:
      return { route: 'manual', reason: 'none', note: '属性: AIで判定できませんでした（似たお手本がありません）' };
  }
}

// 属性判定のモード：off（しない）／record（判定して記録するだけ。承認には使わない）／enforce（自動承認の条件に使う）
async function getAttrCheckMode(db = pool) {
  try {
    const r = await db.query("SELECT value FROM settings WHERE key = 'attr_check_mode'");
    const v = r.rows[0]?.value;
    return ['off', 'record', 'enforce'].includes(v) ? v : 'record';
  } catch { return 'record'; }
}

// 投稿1件の判定：特徴を計算して保存し、お手本と比べて結果を返す（失敗しても例外は投げない）
async function judgeSubmission({ imageUrl, scoreId, eventType, typeGuess, roles, boxes, attribute }) {
  const t0 = Date.now();
  try {
    // 切り出しに使う画面の種類は、Geminiが画像から読んだ種類を優先（イベントの登録上の種類と画面が違うことがある）
    const layoutType = typeGuess && typeGuess !== 'unknown' ? typeGuess : eventType;
    const { mvp, icons } = await computeVectors(imageUrl, layoutType, boxes);
    await saveVectors(pool, { imageUrl, scoreId, eventType: layoutType, roles, mvp, icons });
    const result = await judgeVectors({ mvp, icons, roles, url: imageUrl });
    const r = routeFor(result, attribute);
    return { ...result, ...r, submitted: attribute, ms: Date.now() - t0, at: new Date().toISOString() };
  } catch (err) {
    console.error('属性判定でエラー:', err.message);
    return { v: VERSION, error: err.message, ms: Date.now() - t0, at: new Date().toISOString() };
  }
}

// 保存済みの特徴で判定し直す（承認済み投稿の点検用。自分自身はお手本から除く）
async function rejudgeStored(imageUrl, attribute, db = pool) {
  await loadRefs(db);
  let v = _vecCache.get(imageUrl);
  if (!v) {
    const r = await db.query('SELECT roles, mvp, icons FROM score_vectors WHERE image_url = $1', [imageUrl]);
    if (!r.rows.length) return null;
    const flat = fromBytes(r.rows[0].icons);
    v = { mvp: fromBytes(r.rows[0].mvp), icons: Array.from({ length: 6 }, (_, k) => flat.subarray(k * DIM, (k + 1) * DIM)), roles: r.rows[0].roles };
  }
  const result = await judgeVectors({ mvp: v.mvp, icons: v.icons, roles: v.roles, url: imageUrl }, { db });
  return { ...result, ...routeFor(result, attribute), submitted: attribute };
}

function invalidateRefs() { _refsCheckedAt = 0; }

module.exports = {
  VERSION, LAYOUTS, contentBox, computeVectors, saveVectors, loadRefs, judgeVectors, routeFor,
  getAttrCheckMode, judgeSubmission, rejudgeStored, invalidateRefs, toBytes,
};
