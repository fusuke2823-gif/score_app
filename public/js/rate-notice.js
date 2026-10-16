// ===== レート更新の通知（TOPのみ） =====
// 結果通知（配布）が全部終わってから出す。前に見たときから増えた回の分を、1回ずつ順にアニメーションで見せる
// （結果通知が2つ以上続いたときも、レート更新はまとめて1回）。シーズンが変わったときは前のシーズンの結果と新しいスタートも見せる
// 見た位置は localStorage の hbr_rate_seen_{id} に { season, n }（シーズンのキーと数えた回の数）で残す
window._rankUpdatePromise = new Promise(resolve => { window._resolveRankUpdate = resolve; });

const RN_COLOR = { C: '#a0a0b0', B: '#5cb85c', A: '#5b9bd5', S: '#e6a028', X: '#ff5a6e', Ex: '#b06bff', Legend: '#ffd24a' };
const RN_ORDER = ['C', 'B', 'A', 'S', 'X', 'Ex', 'Legend'];
const RN_TIER = ['C', 'B', 'A', 'S', 'X', 'Ex'];

const rnBadge = (v, legendRank) => v.rank === 'Legend'
  ? `/img/legend${legendRank || 1}.png` : `/img/rank_${v.rank.toLowerCase()}.png`;
const rnRankText = (v, d) => v.rank === 'Legend' ? `LEGEND${d?.legend_rank ? ` <small>${d.legend_rank}位</small>` : ''}` : v.rank;
// 回の短い名前（グラフの下と一覧で使う）
function rnShort(step) {
  const n = (step.name.match(/#\s*(\d+)/) || [])[1];
  if (!n) return step.name;
  if (step.event_type === 'seraph') return `${t('rn.seraph_short')}#${n}`;
  return step.event_type === 'score_attack_ex' ? `#${n} EX` : `#${n}`;
}

async function initRateNotice() {
  const done = () => window._resolveRankUpdate();
  const user = getUser();
  if (!user || !getToken()) return done();
  await window._distNoticeFlow;
  let data;
  try { data = await apiFetch('/users/me/rate-progress'); } catch { return done(); }
  if (!data || !data.season) return done();

  const key = `hbr_rate_seen_${user.id}`;
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
  const cur = { season: data.season.key, n: data.steps.length };
  const save = () => { try { localStorage.setItem(key, JSON.stringify(cur)); } catch {} };

  let mode, from;
  if (!stored) { mode = 'first'; from = 0; }                       // 初めて：シーズンのここまでを全部
  else if (stored.season !== cur.season) { mode = 'new'; from = 0; } // シーズンが変わった
  else if (cur.n > stored.n) { mode = 'update'; from = stored.n; }   // 新しく数えた回がある
  else { save(); return done(); }
  if (mode !== 'new' && data.steps.length === 0) { save(); return done(); }

  // シーズンが変わったとき・初めてのときは、先にシーズン開幕の演出
  if (mode !== 'update') await playSeasonOpening(data, mode);
  openRateModal(data, mode, from, () => { save(); done(); });
}

// ===== シーズン開幕の演出 =====
// 季節の色（キーの月で決める）
const SEASON_TINT = { '12': '#8ccfff', '03': '#ff9ad5', '06': '#3ee0c9', '09': '#ff8a2e' };
// 開幕の背景：季節のモチーフが揺れながら舞い落ちる（冬は雪の結晶、春は花びら、夏は泡、秋はもみじといちょう）
const SO_MAPLE = '<path d="M12 1.6l1.4 3.5 2.6-1.5-.5 3.3 3.5-1.1-1.8 3.1 3.3.6-2.9 2.1 2 1.6-3.9.5.4 2.8-3.3-1.9-.5 3.4h-.6l-.5-3.4-3.3 1.9.4-2.8-3.9-.5 2-1.6-2.9-2.1 3.3-.6-1.8-3.1 3.5 1.1-.5-3.3 2.6 1.5z" fill="currentColor"/><path d="M12 15.5v6.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M12 15.5V6M12 11l-4-3M12 11l4-3" stroke="rgba(0,0,0,0.25)" stroke-width="0.6" fill="none"/>';
const SO_GINKGO = '<path d="M12 17L4.6 8.4A9 9 0 0 1 11.3 3.6L12 6.6l.7-3A9 9 0 0 1 19.4 8.4z" fill="currentColor"/><path d="M12 17v5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>';
const SO_MOTIF = {
  '12': ['<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M12 5l-2-2M12 5l2-2M12 19l-2 2M12 19l2 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>'],
  '09': [SO_MAPLE, SO_MAPLE, SO_MAPLE, SO_GINKGO],
  '03': ['<path d="M12 3c3 3 4 6 0 10-4-4-3-7 0-10z" fill="currentColor"/>'],
  '06': ['<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9.5" cy="9.5" r="1.6" fill="currentColor"/>'],
};
// 秋の葉は1枚ずつ色を変える（黄・橙・朱・紅）
const SO_COLORS = { '09': ['#ffc04a', '#ff8a2e', '#f2552c', '#d8302c', '#b8242c'] };
function soBackground(key) {
  const k = key.split('-')[1], rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
  const shapes = SO_MOTIF[k] || SO_MOTIF['12'], colors = SO_COLORS[k];
  return `<div class="so-bg so-motif">${Array.from({ length: 24 }, () => {
    const z = rnd(16, 40), blur = z < 20 ? 1.4 : z > 35 ? 1.2 : 0;
    return `<i style="left:${rnd(0, 100).toFixed(1)}%;width:${z.toFixed(0)}px;height:${z.toFixed(0)}px;filter:blur(${blur}px);opacity:${(0.45 + z / 80).toFixed(2)};${colors ? `color:${pick(colors)};` : ''}animation-duration:${rnd(9, 16).toFixed(1)}s,${rnd(3, 5).toFixed(1)}s;animation-delay:-${rnd(0, 12).toFixed(1)}s,-${rnd(0, 4).toFixed(1)}s"><svg viewBox="0 0 24 24" style="animation-duration:${rnd(2.2, 4).toFixed(1)}s;animation-delay:-${rnd(0, 3).toFixed(1)}s">${pick(shapes)}</svg></i>`;
  }).join('')}<b></b></div>`;
}
function playSeasonOpening(data, mode) {
  rnStyle();
  const se = data.season;
  const tint = SEASON_TINT[(se.key.split('-')[1] || '')] || '#ffd24a';
  const md = d => { const x = new Date(d); return `${x.getMonth() + 1}/${x.getDate()}`; };
  const me = getUser();
  const el = document.createElement('div');
  el.id = 'season-open';
  el.style.setProperty('--sc', tint);
  el.innerHTML = `
    ${soBackground(se.key)}
    <div class="so-body">
      <div class="so-line"></div>
      <div class="so-eyebrow">${mode === 'new' ? 'SEASON START' : 'RATE SEASON'}</div>
      <div class="so-name">${escHtml(se.name)}</div>
      <div class="so-sub">${escHtml(mode === 'new' ? t('so.open') : t('so.live'))}</div>
      <div class="so-period">${md(se.start)} 〜 ${md(se.last_day)}</div>
      ${se.reward ? `<div class="so-reward">
        <div class="so-reward-k">${escHtml(t('so.reward'))}</div>
        ${frameSampleHtml(se.reward.css_class, me?.username || 'Player')}
        <div class="so-reward-name">${escHtml(se.reward.name)}</div>
      </div>` : ''}
      <div class="so-tap">${escHtml(t('so.tap'))}</div>
    </div>`;
  document.body.appendChild(el);
  lockBodyScroll();
  return new Promise(resolve => {
    let ready = false;
    const go = () => {
      if (!ready) { el.classList.add('skip'); ready = true; return; } // 1回目のタップは演出を最後まで
      clearTimeout(auto);
      el.classList.add('out');
      setTimeout(() => { el.remove(); unlockBodyScroll(); resolve(); }, 450);
    };
    el.addEventListener('click', go);
    setTimeout(() => { ready = true; }, 2600);
    const auto = setTimeout(() => { ready = true; go(); }, 9000);
  });
}

function rnStyle() {
  if (document.getElementById('rate-modal-style')) return;
  const st = document.createElement('style');
  st.id = 'rate-modal-style';
  st.textContent = `
  #rate-modal { position:fixed; inset:0; z-index:2150; display:flex; align-items:center; justify-content:center; padding:16px; background:rgba(4,3,14,0.78); animation:rnFade 0.25s ease both; }
  .rn-box { --pc:#ff6b80; position:relative; width:100%; max-width:380px; max-height:92vh; overflow-y:auto; overflow-x:hidden; border-radius:18px; padding:20px 18px 16px; isolation:isolate;
    background:radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, var(--pc) 26%, transparent), transparent 60%), linear-gradient(160deg, #1d1940, #0f0d24 60%, #0b0a1c);
    border:1px solid color-mix(in srgb, var(--pc) 40%, rgba(255,255,255,0.12)); box-shadow:0 20px 60px rgba(0,0,0,0.55), 0 0 40px color-mix(in srgb, var(--pc) 18%, transparent);
    animation:rnIn 0.45s cubic-bezier(.2,1.3,.4,1) both; }
  .rn-box::before { content:''; position:absolute; inset:0; z-index:-1; pointer-events:none; opacity:0.5;
    background-image:linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px); background-size:18px 18px;
    mask-image:linear-gradient(180deg, #000, transparent 55%); -webkit-mask-image:linear-gradient(180deg, #000, transparent 55%); }
  .rn-head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px; }
  .rn-eyebrow { font-family:"Orbitron",sans-serif; font-weight:800; font-size:0.62rem; letter-spacing:0.26em; color:var(--pc); }
  .rn-season { font-size:0.7rem; font-weight:bold; padding:3px 10px; border-radius:99px; color:#ffd24a; background:rgba(255,210,74,0.1); border:1px solid rgba(255,210,74,0.35); white-space:nowrap; }
  .rn-banner { text-align:center; font-weight:900; font-size:1.05rem; margin:2px 0 10px; letter-spacing:0.02em; }
  .rn-banner small { display:block; font-size:0.72rem; font-weight:bold; color:var(--text-muted); margin-top:2px; }
  .rn-prev { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:12px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.08); margin-bottom:8px; }
  .rn-prev img { height:34px; width:auto; }
  .rn-prev .t { font-size:0.68rem; color:var(--text-muted); }
  .rn-prev .v { font-weight:900; font-size:0.95rem; }
  .rn-prev .p { margin-left:auto; text-align:right; font-size:0.72rem; color:var(--text-muted); }
  .rn-prev .p b { display:block; font-size:0.95rem; color:#fff; }
  .rn-arrow { text-align:center; color:var(--text-muted); font-size:0.75rem; margin:2px 0 6px; }
  .rn-hero { position:relative; display:flex; flex-direction:column; align-items:center; padding:6px 0 4px; }
  .rn-badge-wrap { position:relative; margin-top:18px; height:96px; display:flex; align-items:center; justify-content:center; }
  .rn-badge { height:92px; width:auto; max-width:200px; object-fit:contain; filter:drop-shadow(0 0 14px color-mix(in srgb, var(--pc) 60%, transparent)); }
  .rn-badge.pop { animation:rnPop 0.7s cubic-bezier(.2,1.5,.4,1) both; }
  .rn-burst { position:absolute; left:50%; top:50%; width:150px; height:150px; margin:-75px 0 0 -75px; border-radius:50%; pointer-events:none; opacity:0;
    background:radial-gradient(circle, color-mix(in srgb, var(--pc) 70%, #fff) 0%, color-mix(in srgb, var(--pc) 30%, transparent) 35%, transparent 65%); }
  .rn-burst.go { animation:rnBurst 0.9s ease-out both; }
  .rn-flash { position:absolute; top:-22px; left:50%; transform:translateX(-50%); font-family:"Orbitron",sans-serif; font-weight:900; font-size:1.15rem; letter-spacing:0.16em; white-space:nowrap; z-index:2;
    color:#fff; text-shadow:0 0 12px var(--pc), 0 0 2px var(--pc); opacity:0; padding:2px 12px; border-radius:99px; background:rgba(10,8,26,0.65); }
  .rn-flash.go { animation:rnFlash 2s ease both; }
  .rn-flash.down { color:#ff9a9a; text-shadow:0 0 10px #e05555; }
  .rn-rank { font-weight:900; font-size:1.05rem; color:var(--pc); margin-top:2px; }
  .rn-rank small { font-size:0.78rem; margin-left:3px; }
  .rn-rate { display:flex; align-items:baseline; gap:8px; margin-top:2px; }
  .rn-k { font-family:"Orbitron",sans-serif; font-weight:700; font-size:0.55rem; letter-spacing:0.22em; color:var(--text-muted); }
  .rn-num { font-family:"Orbitron",sans-serif; font-weight:900; font-size:2.6rem; line-height:1; font-variant-numeric:tabular-nums; color:#fff; text-shadow:0 0 18px color-mix(in srgb, var(--pc) 55%, transparent); }
  .rn-delta { font-family:"Orbitron",sans-serif; font-weight:800; font-size:0.9rem; padding:2px 8px; border-radius:99px; opacity:0; transition:opacity 0.3s; }
  .rn-delta.show { opacity:1; }
  .rn-delta.up { color:#6dffa8; background:rgba(60,220,140,0.12); } .rn-delta.down { color:#ff8a8a; background:rgba(230,80,80,0.12); }
  .rn-bar { width:70%; height:6px; border-radius:3px; background:rgba(255,255,255,0.1); overflow:hidden; margin-top:8px; }
  .rn-bar i { display:block; height:100%; width:0; background:linear-gradient(90deg, color-mix(in srgb, var(--pc) 45%, transparent), var(--pc)); border-radius:3px; transition:width 0.9s cubic-bezier(.2,.8,.2,1); }
  .rn-sec { font-size:0.68rem; font-weight:bold; color:var(--text-muted); margin:14px 2px 6px; display:flex; justify-content:space-between; }
  .rn-chart { border-radius:12px; background:rgba(0,0,0,0.22); border:1px solid rgba(255,255,255,0.07); padding:6px 4px 2px; }
  .rn-chart svg { display:block; width:100%; height:auto; overflow:visible; }
  .rn-chart .seg-new { transition:stroke-dashoffset 0.8s ease; }
  .rn-chart .pt { transition:opacity 0.3s, r 0.3s; }
  .rn-steps { display:flex; flex-direction:column; gap:5px; }
  .rn-step { display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:8px; padding:7px 10px; border-radius:10px; font-size:0.8rem;
    background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); opacity:0.35; transform:translateX(-6px); transition:opacity 0.35s, transform 0.35s, border-color 0.35s, background 0.35s; }
  .rn-step.on { opacity:1; transform:none; }
  .rn-step.now { border-color:color-mix(in srgb, var(--pc) 55%, transparent); background:color-mix(in srgb, var(--pc) 10%, transparent); }
  .rn-step .nm { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:bold; }
  .rn-step .ba { color:var(--text-muted); font-variant-numeric:tabular-nums; white-space:nowrap; font-size:0.74rem; }
  .rn-step .ba b { color:#fff; }
  .rn-step .dl { font-family:"Orbitron",sans-serif; font-weight:800; font-size:0.72rem; min-width:44px; text-align:right; white-space:nowrap; }
  .rn-step .dl.up { color:#6dffa8; } .rn-step .dl.down { color:#ff8a8a; } .rn-step .dl.rk { color:var(--pc); }
  .rn-pos { display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding:9px 12px; border-radius:10px; background:rgba(255,255,255,0.04); font-size:0.8rem; }
  .rn-pos b { font-size:1rem; }
  .rn-skip { text-align:center; font-size:0.66rem; color:var(--text-muted); margin-top:8px; transition:opacity 0.3s; }
  .rn-actions { display:flex; gap:8px; margin-top:12px; }
  .rn-actions .btn { flex:1; justify-content:center; text-decoration:none; white-space:nowrap; font-size:0.85rem; padding-left:8px; padding-right:8px; }
  #season-open { --sc:#ffd24a; position:fixed; inset:0; z-index:2160; display:flex; align-items:center; justify-content:center; padding:20px; cursor:pointer; overflow:hidden;
    background:radial-gradient(80% 60% at 50% 45%, color-mix(in srgb, var(--sc) 22%, #0b0920), #05040f 75%); animation:rnFade 0.4s ease both; }
  #season-open.out { animation:soOut 0.45s ease both; }
  .so-bg { position:absolute; inset:0; pointer-events:none; overflow:hidden; }
  .so-bg b { position:absolute; inset:0; background:radial-gradient(ellipse at 50% 45%, transparent 35%, rgba(0,0,0,0.65) 100%); }
  /* 季節のモチーフが舞う */
  .so-motif::before { content:''; position:absolute; left:50%; top:45%; width:90vmin; height:90vmin; margin:-45vmin 0 0 -45vmin; border-radius:50%;
    background:radial-gradient(circle, color-mix(in srgb, var(--sc) 26%, transparent), transparent 62%); }
  .so-motif i { position:absolute; top:-30px; color:color-mix(in srgb, var(--sc) 75%, #fff); animation:soFall linear infinite, soSway ease-in-out infinite alternate; }
  .so-motif svg { width:100%; height:100%; display:block; filter:drop-shadow(0 0 4px color-mix(in srgb, currentColor 60%, transparent)); animation:soFlip ease-in-out infinite alternate; }
  @keyframes soFlip { from { transform:rotateY(-25deg) rotateX(15deg) rotate(-10deg); } to { transform:rotateY(45deg) rotateX(-20deg) rotate(15deg); } }
  @keyframes soFall { to { top:105%; transform:rotate(320deg); } }
  @keyframes soSway { from { margin-left:-18px; } to { margin-left:18px; } }
  .so-body { position:relative; z-index:1; width:100%; max-width:380px; text-align:center; }
  .so-line { height:1px; margin:0 auto 14px; width:0; background:linear-gradient(90deg, transparent, var(--sc), transparent); animation:soLine 0.7s cubic-bezier(.2,.8,.2,1) 0.15s forwards; }
  .so-eyebrow { font-family:"Orbitron",sans-serif; font-weight:800; font-size:0.72rem; color:var(--sc); letter-spacing:0.9em; opacity:0; animation:soSpread 0.8s cubic-bezier(.2,.8,.2,1) 0.45s forwards; }
  .so-name { margin-top:10px; font-family:"Zen Kaku Gothic New",sans-serif; font-weight:900; font-size:2.1rem; line-height:1.2; color:#fff;
    text-shadow:0 0 24px color-mix(in srgb, var(--sc) 70%, transparent); clip-path:inset(-40% 100% -40% -10%); animation:soReveal 0.9s cubic-bezier(.6,0,.2,1) 0.85s forwards; }
  .so-sub { margin-top:4px; font-weight:900; font-size:1.05rem; letter-spacing:0.3em; color:var(--sc); opacity:0; animation:topFadeSo 0.5s ease 1.55s forwards; }
  .so-period { margin-top:8px; font-family:"Orbitron",sans-serif; font-weight:700; font-size:0.85rem; color:rgba(255,255,255,0.75); letter-spacing:0.1em; opacity:0; animation:topFadeSo 0.5s ease 1.75s forwards; }
  .so-reward { margin-top:26px; padding:12px 10px 10px; border-radius:14px; background:rgba(0,0,0,0.3); border:1px solid color-mix(in srgb, var(--sc) 35%, transparent);
    opacity:0; transform:translateY(16px); animation:soUp 0.7s cubic-bezier(.2,1.2,.4,1) 2.2s forwards; }
  .so-reward-k { font-size:0.72rem; font-weight:bold; color:#ffd24a; letter-spacing:0.08em; margin-bottom:2px; }
  .so-reward .frame-sample { margin:14px 6px 8px; cursor:default; }
  .so-reward-name { font-size:0.8rem; font-weight:bold; color:rgba(255,255,255,0.85); }
  .so-tap { margin-top:22px; font-size:0.72rem; color:rgba(255,255,255,0.55); letter-spacing:0.2em; opacity:0; animation:soBlink 1.6s ease 2.9s infinite; }
  #season-open.skip .so-line, #season-open.skip .so-eyebrow, #season-open.skip .so-name, #season-open.skip .so-sub, #season-open.skip .so-period, #season-open.skip .so-reward {
    animation-delay:0s !important; animation-duration:0.01s !important; }
  #season-open.skip .so-tap { animation-delay:0s; }
  @keyframes soOut { to { opacity:0; transform:scale(1.04); } }
  @keyframes soLine { to { width:86%; } }
  @keyframes soSpread { from { opacity:0; letter-spacing:0.9em; } to { opacity:1; letter-spacing:0.32em; } }
  @keyframes soReveal { to { clip-path:inset(-40% -10% -40% -10%); } }
  @keyframes topFadeSo { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
  @keyframes soUp { to { opacity:1; transform:none; } }
  @keyframes soBlink { 0%, 100% { opacity:0.25; } 50% { opacity:0.8; } }
  @media (prefers-reduced-motion: reduce) {
    #season-open *, #season-open { animation-duration:0.01s !important; animation-delay:0s !important; animation-iteration-count:1 !important; }
    .so-bg i { display:none; }
  }
  @keyframes rnFade { from { opacity:0; } to { opacity:1; } }
  @keyframes rnIn { from { opacity:0; transform:translateY(18px) scale(0.94); } to { opacity:1; transform:none; } }
  @keyframes rnPop { 0% { transform:scale(0.3) rotate(-12deg); opacity:0; } 60% { transform:scale(1.18) rotate(3deg); opacity:1; } 100% { transform:none; } }
  @keyframes rnBurst { 0% { opacity:0; transform:scale(0.2); } 30% { opacity:1; } 100% { opacity:0; transform:scale(1.6); } }
  @keyframes rnFlash { 0% { opacity:0; transform:translate(-50%, 10px) scale(0.6); } 18% { opacity:1; transform:translate(-50%, 0) scale(1.12); } 30% { transform:translate(-50%, 0) scale(1); } 80% { opacity:1; } 100% { opacity:0; transform:translate(-50%, -8px); } }
  @media (prefers-reduced-motion: reduce) { #rate-modal, .rn-box, .rn-badge.pop, .rn-burst.go, .rn-flash.go { animation:none; } }
  `;
  document.head.appendChild(st);
}

// シーズン内の推移のグラフ（高さはランクの段。目盛りはランクの名前だけ）
function rnChart(points, from) {
  if (points.length < 2) return '';
  const W = 320, H = 118, L = 26, R = 12, T = 12, B = 22;
  const ys = points.map(p => p.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 0.6) { const m = (hi + lo) / 2; lo = m - 0.3; hi = m + 0.3; }
  lo -= 0.12; hi += 0.12;
  const X = i => L + (W - L - R) * i / (points.length - 1);
  const Y = y => T + (H - T - B) * (1 - (y - lo) / (hi - lo));
  let grid = '';
  for (let k = Math.ceil(lo); k <= Math.floor(hi); k++) {
    grid += `<line x1="${L}" x2="${W - R}" y1="${Y(k).toFixed(1)}" y2="${Y(k).toFixed(1)}" stroke="rgba(255,255,255,0.12)" stroke-dasharray="3 4"/>`;
    if (RN_TIER[k]) grid += `<text x="${L - 6}" y="${(Y(k) + 3).toFixed(1)}" text-anchor="end" font-size="9" font-weight="bold" fill="${RN_COLOR[RN_TIER[k]]}">${RN_TIER[k]}</text>`;
  }
  const pts = points.map((p, i) => [X(i), Y(p.y)]);
  const old = pts.slice(0, from + 1).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  let segs = '';
  for (let i = from + 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const len = Math.hypot(x1 - x0, y1 - y0).toFixed(1);
    segs += `<path class="seg-new" data-i="${i}" d="M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}" stroke="url(#rn-g)" stroke-width="2.4" stroke-linecap="round" fill="none" stroke-dasharray="${len}" stroke-dashoffset="${len}"/>`;
  }
  const dots = pts.map(([x, y], i) => `<circle class="pt" data-i="${i}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i <= from ? 2.6 : 3.4}" fill="${i <= from ? 'rgba(255,255,255,0.55)' : '#fff'}" ${i > from ? 'opacity="0"' : ''}/>`).join('');
  const labels = points.map((p, i) => i > from && p.label ? `<text x="${pts[i][0].toFixed(1)}" y="${H - 6}" text-anchor="${i === points.length - 1 ? 'end' : 'middle'}" font-size="8.5" fill="rgba(255,255,255,0.6)">${escHtml(p.label)}</text>` : '').join('');
  return `<svg viewBox="0 0 ${W} ${H}"><defs><linearGradient id="rn-g" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.7"/><stop offset="1" stop-color="var(--pc)"/></linearGradient></defs>
    ${grid}<path d="${old}" stroke="rgba(255,255,255,0.4)" stroke-width="1.8" fill="none" stroke-linejoin="round"/>${segs}${dots}${labels}</svg>`;
}

function openRateModal(data, mode, from, onClose) {
  rnStyle();
  const steps = data.steps;
  const shown = steps.slice(from); // 今回見せる回
  // 見せ始めの状態：今回の最初の回の前（なければシーズンのスタート）
  const first = shown.length ? shown[0].before : data.start;
  const points = [{ y: data.start.y, label: '' }, ...steps.map(s => ({ y: s.after.y, label: rnShort(s) }))];
  const sign = n => (n > 0 ? '+' : '') + n;
  // 増減：同じランクの中か、X・Ex・LEGEND どうし（目盛りが続いている）なら数で。ランクの段が変わったら段の名前で
  const xs = r => ['X', 'Ex', 'Legend'].includes(r);
  const rkName = r => r === 'Legend' ? 'LEGEND' : r;
  const sameScale = (a, b) => a.rank === b.rank || (xs(a.rank) && xs(b.rank));
  const deltaOf = s => sameScale(s.before, s.after)
    ? { cls: s.before.rank !== s.after.rank ? 'rk' : s.after.rate >= s.before.rate ? 'up' : 'down', txt: sign(s.after.rate - s.before.rate) }
    : { cls: 'rk', txt: `→ ${rkName(s.after.rank)}` };

  const banner = mode === 'new'
    ? `<div class="rn-banner">${escHtml(t('rn.new_season', data.season.name))}</div>
       ${data.prev ? `<div class="rn-prev" style="--pc:${RN_COLOR[data.prev.rank]}">
          <img src="${rnBadge(data.prev, data.prev.position)}" alt="">
          <div><div class="t">${escHtml(t('rn.prev_result', data.prev.name))}</div><div class="v" style="color:${RN_COLOR[data.prev.rank]}">${data.prev.rank === 'Legend' ? 'LEGEND' : data.prev.rank} ${data.prev.rate}</div></div>
          <div class="p">${escHtml(t('rn.season_pos'))}<b>${escHtml(t('rate.position', data.prev.position, data.prev.participants))}</b></div>
        </div>
        <div class="rn-arrow">▼ ${escHtml(t('rn.start'))} ${data.start.rank} ${data.start.rate}</div>` : ''}`
    : mode === 'first' ? `<div class="rn-banner">${escHtml(t('rn.so_far', data.season.name))}</div>` : '';

  const modal = document.createElement('div');
  modal.id = 'rate-modal';
  modal.innerHTML = `
    <div class="rn-box" style="--pc:${RN_COLOR[first.rank]}">
      <div class="rn-head"><span class="rn-eyebrow">RATE UPDATE</span><span class="rn-season">${escHtml(data.season.name)}</span></div>
      ${banner}
      <div class="rn-hero">
        <div class="rn-badge-wrap"><div class="rn-burst"></div><img class="rn-badge" src="${rnBadge(first, data.now.rank === 'Legend' && first.rank === 'Legend' ? data.legend_rank : null)}" alt=""><div class="rn-flash"></div></div>
        <div class="rn-rank">${rnRankText(first)}</div>
        <div class="rn-rate"><span class="rn-k">RATE</span><span class="rn-num">${first.rate}</span><span class="rn-delta"></span></div>
        ${['C', 'B', 'A', 'S'].includes(first.rank) ? `<div class="rn-bar"><i style="width:${first.rate / 10}%"></i></div>` : '<div class="rn-bar" style="visibility:hidden"><i></i></div>'}
      </div>
      ${points.length > 1 ? `<div class="rn-sec"><span>${escHtml(t('rn.trend'))}</span></div><div class="rn-chart">${rnChart(points, from)}</div>` : ''}
      ${shown.length ? `<div class="rn-sec"><span>${escHtml(t(mode === 'update' ? 'rn.updates' : 'rn.season_events'))}</span><span>${shown.length}</span></div>
      <div class="rn-steps">${shown.map((s, i) => { const d = deltaOf(s); return `<div class="rn-step" data-i="${i}">
        <span class="nm">${escHtml(s.name)}</span>
        <span class="ba">${s.before.rate} → <b>${s.after.rate}</b></span>
        <span class="dl ${d.cls}">${d.txt}</span></div>`; }).join('')}</div>` : ''}
      ${data.position ? `<div class="rn-pos"><span>${escHtml(t('rn.season_pos'))}</span><b>${escHtml(t('rate.position', data.position, data.participants))}</b></div>` : ''}
      <div class="rn-skip">${escHtml(t('rn.skip'))}</div>
      <div class="rn-actions">
        <a class="btn btn-secondary" href="/rate-ranking.html">${escHtml(t('rn.to_ranking'))}</a>
        <button class="btn btn-primary" type="button" data-close>${escHtml(t('close'))}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  lockBodyScroll();

  const box = modal.querySelector('.rn-box');
  const $ = sel => modal.querySelector(sel);
  let finished = false, skipping = false;
  const close = () => { modal.remove(); unlockBodyScroll(); onClose(); };
  modal.querySelector('[data-close]').onclick = close;
  modal.querySelector('a.btn').addEventListener('click', () => { onClose(); });
  modal.addEventListener('click', e => { if (e.target === modal) { if (finished) close(); else skipping = true; } });
  box.addEventListener('click', e => { if (!finished && !e.target.closest('.rn-actions')) skipping = true; });

  const wait = ms => new Promise(r => {
    const t0 = performance.now();
    (function tick() { if (skipping || performance.now() - t0 >= ms) return r(); requestAnimationFrame(tick); })();
  });
  const countTo = (from, to, ms) => new Promise(r => {
    const el = $('.rn-num'), t0 = performance.now();
    (function tick(now) {
      const k = skipping ? 1 : Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(tick); else r();
    })(t0);
  });
  // 状態をその回のあとに合わせる（ランク・色・バッジ・バー）
  const setState = (v, legendRank) => {
    box.style.setProperty('--pc', RN_COLOR[v.rank]);
    $('.rn-badge').src = rnBadge(v, legendRank);
    $('.rn-rank').innerHTML = rnRankText(v, { legend_rank: legendRank });
    const bar = $('.rn-bar');
    if (['C', 'B', 'A', 'S'].includes(v.rank)) { bar.style.visibility = ''; bar.querySelector('i').style.width = `${v.rate / 10}%`; }
    else bar.style.visibility = 'hidden';
  };
  const showDelta = () => {
    const end = shown.length ? shown[shown.length - 1].after : first;
    const el = $('.rn-delta');
    if (!shown.length) return;
    if (sameScale(first, end)) { const d = end.rate - first.rate; el.textContent = sign(d); el.className = `rn-delta show ${d >= 0 ? 'up' : 'down'}`; }
    else { el.textContent = `${rkName(first.rank)} → ${rkName(end.rank)}`; el.className = `rn-delta show ${RN_ORDER.indexOf(end.rank) > RN_ORDER.indexOf(first.rank) ? 'up' : 'down'}`; }
  };
  const finish = () => {
    finished = true;
    const last = shown.length ? shown[shown.length - 1].after : first;
    setState(last, data.legend_rank);
    $('.rn-num').textContent = last.rate;
    modal.querySelectorAll('.rn-step').forEach(r => r.classList.add('on'));
    modal.querySelectorAll('.rn-chart .seg-new').forEach(p => { p.style.transition = 'none'; p.style.strokeDashoffset = '0'; });
    modal.querySelectorAll('.rn-chart .pt').forEach(c => c.setAttribute('opacity', '1'));
    showDelta();
    $('.rn-skip').style.opacity = '0';
  };

  (async () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !shown.length) return finish();
    await wait(650);
    for (let i = 0; i < shown.length && !skipping; i++) {
      const s = shown[i], gi = from + i + 1; // グラフ上の点の番号
      modal.querySelectorAll('.rn-step').forEach(r => r.classList.remove('now'));
      const row = modal.querySelector(`.rn-step[data-i="${i}"]`);
      row.classList.add('on', 'now');
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const seg = modal.querySelector(`.rn-chart .seg-new[data-i="${gi}"]`);
      if (seg) seg.style.strokeDashoffset = '0';
      const changed = s.before.rank !== s.after.rank;
      if (changed) {
        const up = RN_ORDER.indexOf(s.after.rank) > RN_ORDER.indexOf(s.before.rank);
        const cont = xs(s.before.rank) && xs(s.after.rank); // X・Ex・LEGEND どうしはレートの目盛りが続いている
        if (!cont) await countTo(s.before.rate, up ? 1000 : 0, 500); // C〜S は段の中で 0〜1000
        if (skipping) break;
        setState(s.after, i === shown.length - 1 ? data.legend_rank : null);
        const badge = $('.rn-badge'); badge.classList.remove('pop'); void badge.offsetWidth; badge.classList.add('pop');
        const burst = $('.rn-burst'); burst.classList.remove('go'); void burst.offsetWidth; if (up) burst.classList.add('go');
        const flash = $('.rn-flash');
        flash.textContent = s.after.rank === 'Legend' ? 'LEGEND!' : up ? 'RANK UP!' : 'RANK DOWN';
        flash.className = `rn-flash ${up ? '' : 'down'}`; void flash.offsetWidth; flash.classList.add('go');
        await countTo(cont ? s.before.rate : up ? 0 : 1000, s.after.rate, 800);
        await wait(600);
      } else {
        await countTo(s.before.rate, s.after.rate, 900);
        if (['C', 'B', 'A', 'S'].includes(s.after.rank)) $('.rn-bar i').style.width = `${s.after.rate / 10}%`;
      }
      const pt = modal.querySelector(`.rn-chart .pt[data-i="${gi}"]`);
      if (pt) pt.setAttribute('opacity', '1');
      await wait(450);
    }
    finish();
  })();
}

initRateNotice();
