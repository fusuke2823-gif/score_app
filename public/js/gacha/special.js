// ===== 討伐ガチャ（期間限定） =====
let sgCurrentEnemy = null;
let sgLoaded = false;
// 演出の速さ（normal：ふつう / fast：2倍速 / instant：結果だけ）。選んだものはこの端末に覚えておく
let sgSpeed = (() => { try { return localStorage.getItem('sgSpeed') || 'normal'; } catch (e) { return 'normal'; } })();
const sgT = ms => (sgSpeed === 'fast' ? ms / 2 : sgSpeed === 'instant' ? 0 : ms);
function setSgSpeed(v) {
  sgSpeed = v;
  try { localStorage.setItem('sgSpeed', v); } catch (e) {}
  document.querySelectorAll('#sg-speed > button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
}
// 管理者のテスト中は API の行き先を /special-gacha/test に切り替える
let sgMode = 'live';
// 遊びモード（本番の敵を倒したあと、報酬なし・10連10ptでもう一度戦う）は /special-gacha/play
const sgApi = path => (sgMode === 'test' ? '/special-gacha/test' : sgMode === 'play' ? '/special-gacha/play' : '/special-gacha') + path;
let sgTestGimmick = null;

function switchGachaType(type) {
  document.getElementById('gacha-type-tabs').dataset.active = type;
  document.getElementById('tab-btn-normal').classList.toggle('active', type === 'normal');
  document.getElementById('tab-btn-special').classList.toggle('active', type === 'special');
  const needsPoolSelect = gPools.length > 0 && !selectedPoolId;
  document.getElementById('pool-select-screen').style.display = type === 'normal' && needsPoolSelect ? '' : 'none';
  document.getElementById('gacha-main').style.display = type === 'normal' && !needsPoolSelect ? '' : 'none';
  document.getElementById('special-gacha-screen').style.display = type === 'special' ? '' : 'none';
  if (type === 'special' && !sgLoaded) { sgLoaded = true; loadSpecialGacha(); }
}

const SG_EFFECT_LABELS = {
  ally_small: '攻撃UP小', ally_large: '攻撃UP大',
  debuff_small: '防御DOWN小', debuff_large: '防御DOWN大',
  enemybuff_small: '防御UP小', enemybuff_large: '防御UP大',
  critup_small: 'CRT率UP小', critup_large: 'CRT率UP大',
};

function renderSgEffects(progress) {
  // 続いている効果を敵の周りの光で見せる（防御DOWN：紫、防御UP：青）
  const wrap = document.getElementById('sg-boss-portrait-wrap');
  wrap.classList.toggle('aura-weak', progress.debuff_small > 0 || progress.debuff_large > 0);
  wrap.classList.toggle('aura-guard', progress.enemybuff_small > 0 || progress.enemybuff_large > 0);
  const row = document.getElementById('sg-effects-row');
  row.innerHTML = Object.keys(SG_EFFECT_LABELS)
    .filter(k => progress[k] > 0)
    .map(k => {
      const cls = k.startsWith('enemybuff') ? 'unfav' : 'fav';
      // 文字の代わりにカードと同じ絵柄＋残り回数。効果名は title（長押し・マウスオーバー）と読み上げで補う
      const [base, badge] = SG_ICON_MAP[k];
      const label = `${SG_EFFECT_LABELS[k]} 残り${progress[k]}`;
      return `<span class="sg-eff-badge ${cls}" title="${label}" aria-label="${label}"><span class="sg-icon-stack" aria-hidden="true">${sgSvg(base)}${badge ? sgBadgeSvg(badge) : ''}</span>${progress[k]}</span>`;
    }).join('');
}

function updateSgDefeatedUi(defeated) {
  document.getElementById('sg-defeated-banner').hidden = !defeated;
  document.getElementById('sg-boss-portrait-wrap').classList.toggle('is-defeated', defeated);
  if (defeated) document.getElementById('sg-effects-row').innerHTML = '';
}

let sgMaxDestruction = 999.0;
function renderSgDestructionRate(rate) {
  document.getElementById('sg-destruction-rate').textContent = `${Number(rate).toFixed(1)}/${sgMaxDestruction.toFixed(1)}%`;
}

function renderSgHp(hp, maxHp) {
  const pct = Math.max(0, hp / maxHp * 100);
  const ghost = document.getElementById('sg-hp-ghost');
  // 回復で増えたときは残像を即座に合わせ、減ったときだけ遅れて縮める
  if (pct > parseFloat(ghost.style.width || '100')) {
    ghost.style.transition = 'none';
    ghost.style.width = pct + '%';
    void ghost.offsetWidth;
    ghost.style.transition = '';
  } else {
    ghost.style.width = pct + '%';
  }
  document.getElementById('sg-hp-bar').style.width = pct + '%';
  renderSgRewindBar(hp, maxHp);
}
// 巻き戻しギミック：今の連続で削った分を、HPバーの上に仮のバーとして残す（巻き戻されるとそこまで戻る）
let sgRwTop = null; // 連続が始まったときのHP（連続していなければ null）
function renderSgRewindBar(hp, maxHp) {
  const el = document.getElementById('sg-hp-rewind');
  const show = !!sgRewind && sgRwTop != null && sgRwTop > hp;
  el.hidden = !show;
  if (!show) return;
  el.style.left = Math.max(0, hp / maxHp * 100) + '%';
  el.style.width = Math.max(0, (Math.min(maxHp, sgRwTop) - hp) / maxHp * 100) + '%';
}

// ボスの被弾リアクション（揺れ＋ダメージ数字）
function sgBossReact(r) {
  const wrap = document.getElementById('sg-boss-portrait-wrap');
  let cls = null, text = null, popCls = '';
  if (r.category === 'damage' && r.blocked) { cls = 'is-blocked'; text = r.blocked_dmg; popCls = 'blocked'; }
  else if (r.category === 'damage' && r.dmg > 0) { const big = r.key === 'ultra'; cls = big ? 'is-hit-big' : 'is-hit'; text = r.dmg.toLocaleString('ja-JP'); popCls = big ? 'big' : ''; }
  else if (r.dmg < 0 && !r.overkill) { text = '+' + (-r.dmg).toLocaleString('ja-JP'); popCls = 'heal'; }
  if (cls) {
    wrap.classList.remove('is-hit', 'is-hit-big', 'is-blocked');
    void wrap.offsetWidth; // 連続ヒットでもアニメーションをやり直す
    wrap.classList.add(cls);
  }
  if (text != null) {
    const pop = document.createElement('span');
    pop.className = 'sg-dmg-pop ' + popCls;
    pop.textContent = text;
    wrap.appendChild(pop);
    setTimeout(() => pop.remove(), 1300);
  }
}

// 討伐の瞬間：ボスが光って砕けるように消えてから結果を出す
async function sgPlayDefeat() {
  const wrap = document.getElementById('sg-boss-portrait-wrap');
  wrap.classList.remove('is-hit', 'is-hit-big', 'is-blocked');
  const flash = document.createElement('div');
  flash.className = 'sg-defeat-flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 800);
  _sePlay('/sounds/ss_sound.mp3');
  sgShake(true);
  // かけらが飛び散る
  for (let i = 0; i < 16; i++) {
    const sh = document.createElement('i');
    sh.className = 'sg-shard';
    const ang = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 70 + Math.random() * 70;
    sh.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
    sh.style.setProperty('--dy', `${Math.sin(ang) * dist}px`);
    sh.style.setProperty('--r', `${Math.random() * 360}deg`);
    wrap.appendChild(sh);
    setTimeout(() => sh.remove(), 1100);
  }
  wrap.classList.add('is-dying');
  await sgSleep(sgT(950));
  wrap.classList.remove('is-dying');
  wrap.classList.add('is-defeated');
}

// 画面を揺らす（big：大きく）
function sgShake(big = false) {
  if (sgSpeed === 'instant') return;
  const card = document.querySelector('.sg-boss-card');
  card.classList.remove('sg-shake', 'sg-shake-big');
  void card.offsetWidth;
  card.classList.add(big ? 'sg-shake-big' : 'sg-shake');
}

// 敵の登場：敵ごと（テストはギミックごと）にページを開いて最初の1回だけ
let sgIntroKey = null;
async function sgPlayIntro(enemy, gimmick) {
  const key = `${sgMode}:${enemy.id}:${gimmick ? gimmick.key : ''}`;
  if (sgIntroKey === key || sgSpeed === 'instant') { sgIntroKey = key; return; }
  sgIntroKey = key;
  const card = document.querySelector('.sg-boss-card');
  const box = document.createElement('div');
  box.className = 'sg-intro';
  box.innerHTML = `<small>ENEMY APPEARS</small><b>${escHtml(enemy.name)}</b>${gimmick && gimmick.key !== 'normal' ? `<span>ギミック：${escHtml(gimmick.label)}</span>` : ''}`;
  card.appendChild(box);
  card.classList.add('is-intro');
  _sePlay('/sounds/s_sound.mp3');
  await new Promise(res => {
    let done = false;
    const end = () => { if (done) return; done = true; box.remove(); card.classList.remove('is-intro'); res(); };
    box.addEventListener('pointerdown', end);
    setTimeout(end, sgT(2000));
  });
}

// ===== ギミックの遊び方 =====
let sgTutGimmick = null;
// 巻き戻しは絵つきで、ほかのギミックは説明文で
function sgTutorialHtml(g) {
  if (g.key !== 'rewind') return `<p class="sg-tut-text">${escHtml(g.description || '')}</p>`;
  const step = (n, title, text, visual) => `
    <div class="sg-tut-step"><div class="sg-tut-num">${n}</div><div class="sg-tut-main"><b>${title}</b><p>${text}</p>${visual}</div></div>`;
  return [
    step(1, '続けるほどダメージが上がる', '10連を続けて引くたびに、与えるダメージが上がります。',
      '<div class="sg-tut-vis"><span class="sg-tut-chip">×1</span><i>→</i><span class="sg-tut-chip">×2</span><i>→</i><span class="sg-tut-chip">×3</span><i>→</i><span class="sg-tut-chip">…</span></div>'),
    step(2, '10連後に巻き戻されることがある', `10連のあと、敵が巻き戻しをすることがあります。確率は続けるほど上がります（0% → ${Math.round(g.rewind.p_step * 100)}% → ${Math.round(g.rewind.p_step * 200)}% …）。`,
      '<div class="sg-tut-vis"><span class="sg-tut-bar"><i class="hp"></i><i class="rw"></i></span></div><p class="sg-tut-note">巻き戻されると、HPバーの緑の斜線（この連続で削った分）が全部戻ります</p>'),
    step(3, '100%に届くとリセット', '巻き戻し確率が100%に届いたときは、回復なしで連続だけが0に戻ります。', ''),
    step(4, '自分でリセットもできる', '「リセットして引く」を押すと、ダメージ×1・巻き戻し確率0%から始め直せます。攻めるか守るか、選びどころです。',
      '<div class="sg-tut-vis"><span class="sg-tut-reset">リセットして引く</span></div>'),
  ].join('');
}
function showSgTutorial(g) {
  sgTutGimmick = g;
  document.getElementById('sg-tut-title').textContent = `ギミック：${g.label}`;
  document.getElementById('sg-tut-body').innerHTML = sgTutorialHtml(g);
  document.getElementById('sg-tut').hidden = false;
}
function openSgTutorial() { if (sgTutGimmick) showSgTutorial(sgTutGimmick); }
function closeSgTutorial() { document.getElementById('sg-tut').hidden = true; }
// ギミックごとに最初の1回だけ自動で出す（この端末に覚えておく）
function sgMaybeTutorial(g) {
  if (!g || g.key === 'normal') return;
  sgTutGimmick = g;
  const key = 'sgTutSeen:' + g.key;
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch (e) {}
  showSgTutorial(g);
}

// 斬撃の形：両端が細く真ん中が太い三日月（色はCSSの --c1・--c2）
const SG_SLASH_SVG = '<svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="sgSlashG" x1="0" x2="1"><stop offset="0" style="stop-color:var(--c2);stop-opacity:0"/><stop offset="0.35" style="stop-color:var(--c2)"/><stop offset="0.6" style="stop-color:var(--c1)"/><stop offset="1" style="stop-color:var(--c1);stop-opacity:0"/></linearGradient></defs><path d="M4 78 Q100 -6 196 30 Q104 18 4 78 Z" fill="url(#sgSlashG)"/><path d="M30 64 Q100 8 170 30 Q104 24 30 64 Z" fill="#fff" opacity="0.9"/></svg>';
// カードがめくれたときの攻撃の演出：斬撃・クリティカル・シールドの波紋・効果の文字
function sgAttackFx(r, cardEl) {
  if (sgSpeed === 'instant' || r.overkill) return;
  const wrap = document.getElementById('sg-boss-portrait-wrap');
  const add = (cls, ms, props = {}) => {
    const el = document.createElement('i');
    el.className = cls;
    for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v);
    wrap.appendChild(el);
    setTimeout(() => el.remove(), ms);
    return el;
  };
  if (r.category === 'damage' && r.blocked) { add('sg-ripple', 700); return; }
  if (r.category === 'damage' && r.dmg > 0) {
    // 三日月形の斬撃。大ダメージは2本、クリティカルは十字に2本＋太い1本
    const ultra = r.key === 'ultra';
    const base = -40 + Math.random() * 30;
    const angles = ultra ? [base, base + 90, base + 45] : r.key === 'crit' ? [base, base + 70] : [base];
    angles.forEach((a, i) => setTimeout(() => {
      const el = add('sg-slash' + (ultra ? ' is-ultra' : '') + (ultra && i === 2 ? ' is-big' : ''), 560, { '--a': `${a}deg` });
      el.innerHTML = SG_SLASH_SVG;
      add('sg-impact', 420);
      for (let k = 0; k < (ultra ? 10 : 5); k++) {
        const ang = Math.random() * Math.PI * 2, d = 30 + Math.random() * (ultra ? 60 : 35);
        add('sg-spark', 480, { '--dx': `${Math.cos(ang) * d}px`, '--dy': `${Math.sin(ang) * d}px`, '--r': `${ang}rad` });
      }
    }, sgT(i * 90)));
    if (ultra) { sgShake(true); sgRwPop('CRITICAL!', '', 'is-crit'); }
    else if (r.key === 'crit') sgShake(false);
    return;
  }
  if (r.category === 'gauge') { add('sg-reticle', 800); return; }
  // 効果の名前を、めくったカードの上に浮かせる
  const LABEL = { ally: 'ATK UP', critup: 'CRT UP', debuff: 'DEF DOWN', enemybuff: 'ENEMY DEF UP', destruction: 'BREAK UP', shield_break: 'SHIELD DOWN', shield_regen: 'SHIELD UP' };
  const kind = Object.keys(LABEL).find(k => (r.key || '').startsWith(k)) || (r.category === 'destruction' ? 'destruction' : null);
  if (kind && cardEl) {
    const t = document.createElement('span');
    t.className = 'sg-card-pop ' + (r.category === 'unfavorable' || kind === 'shield_regen' ? 'bad' : 'good');
    t.textContent = LABEL[kind];
    cardEl.appendChild(t);
    setTimeout(() => t.remove(), 1100);
  }
  if (kind === 'debuff') add('sg-aura-flash weak', 700);
  if (kind === 'enemybuff') add('sg-aura-flash guard', 700);
  if (kind === 'destruction') {
    const d = document.querySelector('.sg-destruction');
    d.classList.remove('pulse'); void d.offsetWidth; d.classList.add('pulse');
  }
}

// 10連のまとめ：合計ダメージを数え上げる
async function sgPlayTotal(total) {
  if (!total || sgSpeed === 'instant') return;
  const card = document.querySelector('.sg-boss-card');
  const el = document.createElement('div');
  el.className = 'sg-total';
  el.innerHTML = '<small>TOTAL DAMAGE</small><b>0</b>';
  card.appendChild(el);
  const b = el.querySelector('b');
  const dur = sgT(700), t0 = performance.now();
  await new Promise(res => {
    const step = now => {
      const f = Math.min(1, (now - t0) / Math.max(1, dur));
      b.textContent = Math.round(total * (1 - Math.pow(1 - f, 3))).toLocaleString('ja-JP');
      if (f < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
  el.classList.add('done');
  await sgSleep(sgT(700));
  el.remove();
}

// シールドギミックの敵だけ表示。0になっても復活しうるので、バーは消さずに「BREAK」表示にする
let sgMaxShield = 0;
let sgShieldNow = 0;
function renderSgShield(shield, animate = false) {
  const row = document.getElementById('sg-shield-row');
  row.hidden = !sgMaxShield;
  if (!sgMaxShield) return;
  const broken = shield <= 0;
  row.classList.toggle('is-broken', broken);
  document.getElementById('sg-shield-state').textContent = broken ? 'SHIELD BREAK' : 'SHIELD';
  document.getElementById('sg-shield-num').textContent = `${Math.max(0, shield)}/${sgMaxShield}`;
  document.getElementById('sg-shield-bar').style.width = Math.max(0, shield / sgMaxShield * 100) + '%';
  if (animate && (sgShieldNow > 0) !== (shield > 0)) {
    const card = document.querySelector('.sg-boss-card');
    const cls = broken ? 'sg-shield-break' : 'sg-shield-up';
    card.classList.remove('sg-shield-break', 'sg-shield-up');
    void card.offsetWidth; // 連続で発生してもアニメーションをやり直す
    card.classList.add(cls);
  }
  sgShieldNow = shield;
}

// ===== 巻き戻しギミック =====
let sgRewind = null; // { dmg_step, p_step }（巻き戻しの敵のときだけ）
let sgRwMultNow = 1; // 今引いている10連の倍率（カードに×Nを添える）
const sgSleep = ms => new Promise(r => setTimeout(r, ms));
// 確率が100%に届く連続回数（+10%ずつなら10）
const sgRwMax = () => Math.ceil(1 / sgRewind.p_step - 1e-9);
// 連続 k のとき、次の10連はダメージ (1+k) 倍、10連後 k×10% で巻き戻し（100%以上なら回復なしでリセット）
function renderSgRewind(progress) {
  const el = document.getElementById('sg-rewind');
  const btn = document.getElementById('sg-reset-btn');
  const badge = document.getElementById('sg-chain-badge');
  const card = document.querySelector('.sg-boss-card');
  const on = !!sgRewind && !progress.defeated_at;
  const k = on ? progress.rewind_streak || 0 : 0;
  el.hidden = !on;
  btn.hidden = !on || k <= 0;
  badge.hidden = !on || k <= 0;
  // 続けるほど敵のカードが熱くなる（0〜4段階）
  for (let i = 0; i <= 4; i++) card.classList.toggle(`sg-chain-${i}`, on && Math.min(4, k) === i);
  if (!on) return;
  const mult = 1 + sgRewind.dmg_step * k;
  const p = Math.min(100, Math.round(sgRewind.p_step * k * 100));
  const max = sgRwMax();
  const dmg = progress.rewind_dmg || 0;
  sgRwTop = dmg > 0 ? progress.current_hp + dmg : null;
  renderSgRewindBar(progress.current_hp, sgCurrentEnemy.max_hp);
  badge.textContent = `×${mult}`;
  const pips = Array.from({ length: max }, (_, i) => `<i class="${i < k ? 'on' : ''}${i === k ? ' next' : ''}${i === max - 1 ? ' last' : ''}"></i>`).join('');
  const risk = p >= 100 ? '10連後 連続リセット（回復なし）' : `10連後 巻き戻し確率 ${p}%`;
  el.innerHTML = `
    <div class="sg-rw-chain lv-${Math.min(4, k)}"><span>CHAIN</span><b>${k}</b></div>
    <div class="sg-rw-body">
      <div class="sg-rw-pips" aria-hidden="true">${pips}</div>
      <div class="sg-rw-line"><span>次の10連 ダメージ</span><b class="sg-rw-mult">×${mult}</b></div>
      <div class="sg-rw-meter${p >= 100 ? ' is-forced' : p === 0 ? ' is-safe' : ''}">
        <span>${risk}</span>
      </div>
    </div>`;
}

// 敵の上に大きな文字を出す（REWIND / CHAIN 3! など）
function sgRwPop(main, sub, cls) {
  const wrap = document.getElementById('sg-boss-portrait-wrap');
  const pop = document.createElement('div');
  pop.className = 'sg-rw-pop ' + cls;
  pop.innerHTML = `<b>${main}</b>${sub ? `<small>${sub}</small>` : ''}`;
  wrap.appendChild(pop);
  setTimeout(() => pop.remove(), 1900);
}

// 10連のあとの判定：50コマの帯の上を光が回り、だんだん遅くなって止まる。赤いコマの並びと止まるコマはサーバーの抽選のとおり
function sgRewindCheck(check) {
  if (!check) return Promise.resolve();
  return new Promise(resolve => {
    const overlay = document.getElementById('sg-rwc');
    const strip = document.getElementById('sg-rwc-strip');
    const result = document.getElementById('sg-rwc-result');
    const hint = document.getElementById('sg-rwc-hint');
    // 赤いコマの位置と止まるコマはサーバーが抽選したもの（止まったコマが赤なら巻き戻し）
    const N = 50;
    const forced = check.result === 'forced';
    const redSet = new Set(check.cells || []);
    const isRed = Array.from({ length: N }, (_, i) => forced || redSet.has(i));
    const target = forced ? Math.floor(N / 2) : check.stop;
    strip.innerHTML = isRed.map(r => `<i class="${r ? 'red' : 'safe'}"></i>`).join('');
    const cells = strip.children;
    document.getElementById('sg-rwc-chance').innerHTML = forced ? '<b>100%</b> OVERHEAT' : `巻き戻し <b>${Math.round(check.chance * 100)}%</b>`;
    result.textContent = '';
    result.className = 'sg-rwc-result';
    hint.textContent = 'タップでスキップ';
    overlay.classList.toggle('is-forced', forced);
    overlay.hidden = false;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 2周してから目的のマスへ。1マスごとの間隔を少しずつ伸ばす
    const steps = forced || reduced || sgSpeed === 'instant' ? 0 : (sgSpeed === 'fast' ? N : 2 * N) + target;
    let i = 0, timer = 0, done = false;
    const light = idx => { for (const c of cells) c.classList.remove('lit'); cells[idx].classList.add('lit'); };
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      overlay.removeEventListener('pointerdown', finish);
      light(target);
      cells[target].classList.add('hit');
      _sePlay('/sounds/gauge_hit.mp3');
      const text = forced ? 'CHAIN RESET' : check.result === 'safe' ? 'SAFE' : 'REWIND';
      result.textContent = text;
      result.classList.add(forced ? 'is-forced' : check.result === 'safe' ? 'is-safe' : 'is-rewind', 'pop');
      overlay.classList.add(check.result === 'safe' ? 'end-safe' : 'end-bad');
      hint.textContent = '';
      setTimeout(() => {
        overlay.hidden = true;
        overlay.classList.remove('end-safe', 'end-bad');
        resolve();
      }, sgSpeed === 'instant' ? 450 : sgT(900));
    };
    const tick = () => {
      if (done) return;
      light(i % N);
      if (i % 4 === 0) _sePlay('/sounds/putcard.mp3');
      if (i >= steps) return finish();
      const left = steps - i;
      i++;
      // コマが細かいぶん速く回し、最後の16コマでだんだん遅くする
      timer = setTimeout(tick, sgT(left > 16 ? 15 : 15 + (16 - left) * 13));
    };
    setTimeout(() => { if (!done) overlay.addEventListener('pointerdown', finish); }, 250);
    if (forced) setTimeout(finish, sgT(700)); else tick();
  });
}

// 判定のあとの演出。rewind：ビデオの巻き戻し風にカードを逆順で裏返し、HPを戻す。forced：OVERHEAT。safe：CHAIN が伸びる
async function sgPlayRewind(rw, check, progress) {
  if (!check) return;
  if (check.result === 'safe') {
    _sePlay('/sounds/s_sound.mp3');
    sgRwPop(`CHAIN ${progress.rewind_streak}!`, `次の10連 ×${1 + sgRewind.dmg_step * progress.rewind_streak}`, 'is-safe');
    await sgSleep(sgT(900));
    return;
  }
  if (check.result === 'forced') {
    sgRwPop('OVERHEAT', '連続リセット（回復なし）', 'is-forced');
    await sgSleep(sgT(1100));
    return;
  }
  const vhs = document.getElementById('sg-vhs');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || sgSpeed === 'instant';
  vhs.hidden = false;
  document.body.classList.add('sg-vhs-on');
  _sePlay('/sounds/ss_sound.mp3');
  // 引いたカードを逆の順番で伏せ直す
  const flipped = [...document.querySelectorAll('#sg-stage .g-card-inner.flipped')].reverse();
  const from = rw.hp_before, to = rw.hp_before + rw.amount, max = sgCurrentEnemy.max_hp;
  const total = reduced ? 1 : Math.max(8, flipped.length);
  for (let i = 0; i < total; i++) {
    if (flipped[i]) { flipped[i].classList.remove('flipped'); if (i % 2 === 0) _sePlay('/sounds/turn.mp3'); }
    const hpNow = Math.round(from + (to - from) * (i + 1) / total);
    renderSgHp(hpNow, max);
    await sgSleep(reduced ? 0 : sgT(90));
  }
  sgRwTop = null;
  renderSgRewindBar(to, max);
  sgRwPop('REWIND', 'この連続で削った分が戻った', 'is-rewind');
  await sgSleep(reduced ? 300 : sgT(900));
  document.body.classList.remove('sg-vhs-on');
  vhs.hidden = true;
  await sgSleep(sgT(500));
}

function renderSgGimmick(gimmick) {
  const el = document.getElementById('sg-gimmick');
  sgRewind = gimmick && gimmick.rewind ? gimmick.rewind : null;
  sgMaxShield = gimmick ? gimmick.max_shield : 0;
  sgGaugeTiers = gimmick && gimmick.gauge ? gimmick.gauge.tiers : null;
  if (gimmick && gimmick.gauge) sgGaugeAuto = gimmick.gauge.auto_accuracy;
  sgMaxDestruction = gimmick && gimmick.max_destruction ? Number(gimmick.max_destruction) : 999.0;
  el.hidden = !gimmick || gimmick.key === 'normal';
  if (el.hidden) return;
  document.getElementById('sg-gimmick-tag').textContent = gimmick.label;
}

// ===== 管理者のテスト =====
function initSgTestBar() {
  setSgSpeed(sgSpeed);
  const u = getUser();
  document.getElementById('sg-test-bar').hidden = !(u && u.role === 'admin');
}
function setSgMode(mode) {
  sgMode = mode;
  document.querySelectorAll('#sg-mode > button').forEach(b => b.classList.toggle('on', b.dataset.v === (mode === 'play' ? 'live' : mode)));
  document.getElementById('sg-test-ctrl').hidden = mode !== 'test';
  document.getElementById('sg-test-note').hidden = mode !== 'test';
  document.getElementById('sg-play-bar').hidden = mode !== 'play';
  document.getElementById('special-gacha-screen').classList.toggle('is-play', mode === 'play');
  sgRatesLoaded = false;
  document.getElementById('sg-rates-panel').hidden = true;
  document.getElementById('sg-rates-panel').classList.remove('open');
  document.getElementById('sg-stage').innerHTML = '';
  document.getElementById('sg-battle-log').textContent = '10連ガチャを引くと、ここに結果が表示されます';
  loadSpecialGacha();
}
async function startSgTest() {
  try {
    const data = await apiFetch('/special-gacha/test/start', { method: 'POST', body: JSON.stringify({ gimmick: document.getElementById('sg-test-gimmick').value }) });
    sgRatesLoaded = false;
    document.getElementById('sg-stage').innerHTML = '';
    document.getElementById('sg-battle-log').textContent = `テスト「${data.gimmick.label}」を最初から始めました`;
    applySgData({ ...data, points: currentPoints });
  } catch (err) { showToast(err.message, 'error'); }
}

// ===== 遊びモード =====
async function startSgPlay() {
  try {
    const data = await apiFetch('/special-gacha/play/start', { method: 'POST' });
    document.getElementById('sg-stage').innerHTML = '';
    document.getElementById('sg-battle-log').textContent = '遊びモードを最初から始めました';
    applySgData({ ...data, points: currentPoints });
  } catch (err) { showToast(err.message, 'error'); }
}
// 10連1回のコスト（本番100pt・遊びモード10pt・テストは0pt）をボタンに文字で出す
// 本番は敵ごとに最初の2回が無料（free_left：残りの無料回数）
let sgFreeLeft = 0;
function renderSgCost(cost, freeLeft) {
  if (freeLeft !== undefined) sgFreeLeft = freeLeft;
  const free = sgMode === 'live' && sgFreeLeft > 0;
  const c = sgMode === 'test' ? 0 : sgMode === 'play' ? 10 : cost ?? 100;
  const text = free ? '無料' : `${c}pt`;
  document.getElementById('sg-pull-cost').textContent = text;
  document.getElementById('sg-reset-cost').textContent = text;
  document.querySelector('#sg-pull-btn img').alt = `討伐ガチャ 10連 ${text}`;
  const badge = document.getElementById('sg-free-badge');
  badge.hidden = !free;
  badge.textContent = `無料あと${sgFreeLeft}回`;
}
// 討伐完了の画面を閉じたら、そのまま遊びモードへ
function closeSgDefeat() {
  document.getElementById('sg-defeat-overlay').classList.remove('show');
  if (sgMode === 'live' && sgLastProgress && sgLastProgress.defeated_at) setSgMode('play');
}

async function loadSpecialGacha() {
  initSgTestBar();
  try {
    let data;
    if (sgMode === 'test') {
      const t = await apiFetch('/special-gacha/test');
      const sel = document.getElementById('sg-test-gimmick');
      sel.innerHTML = t.gimmicks.map(g => `<option value="${g.key}">${escHtml(g.label)}（HP ${g.max_hp.toLocaleString('ja-JP')}）</option>`).join('');
      if (t.test) sel.value = t.test.gimmick.key;
      else if (t.gimmicks.some(g => g.key === 'rewind')) sel.value = 'rewind';
      updatePointsDisplay(t.points);
      currentPoints = t.points;
      if (!t.test) {
        document.getElementById('sg-boss-name').textContent = 'ギミックを選んで「最初から」を押してください';
        document.getElementById('sg-pull-btn').disabled = true;
        document.getElementById('sg-reset-btn').hidden = true;
        document.getElementById('sg-rewind').hidden = true;
        return;
      }
      data = { ...t.test, points: t.points };
    } else if (sgMode === 'play') {
      data = await apiFetch('/special-gacha/play');
    } else {
      data = await apiFetch('/special-gacha/current');
      // 本番の敵を倒したあとは、遊びモードで始める
      if (data.enemy && data.progress.defeated_at) return setSgMode('play');
    }
    applySgData(data);
  } catch (err) {
    document.getElementById('sg-boss-name').textContent = '読み込みに失敗しました';
  }
}

// 敵・ギミック・進み具合を画面に出す（本番の /current とテストの /test は同じ形）
function applySgData(data) {
  sgTestGimmick = sgMode === 'test' && data.gimmick ? data.gimmick.key : null;
  if (!data.enemy) {
    document.getElementById('sg-boss-name').textContent = '現在挑戦できる敵はいません';
    document.getElementById('sg-pull-btn').disabled = true;
    return;
  }
  sgCurrentEnemy = data.enemy;
  document.getElementById('sg-boss-name').textContent = data.enemy.name;
  document.getElementById('sg-boss-portrait').src = data.enemy.image_url;
  document.getElementById('sg-reward-icon').src = data.enemy.ssr_icon_image_url;
  document.getElementById('sg-reward-name').textContent = data.enemy.ssr_icon_name;
  renderSgGimmick(data.gimmick);
  sgTutGimmick = data.gimmick && data.gimmick.key !== 'normal' ? data.gimmick : null;
  if (!data.progress.defeated_at) sgPlayIntro(data.enemy, data.gimmick).then(() => sgMaybeTutorial(data.gimmick));
  renderSgHp(data.progress.current_hp, data.enemy.max_hp);
  renderSgShield(data.progress.shield);
  renderSgDestructionRate(data.progress.destruction_rate);
  renderSgEffects(data.progress);
  updateSgDefeatedUi(!!data.progress.defeated_at);
  renderSgRewind(data.progress);
  updatePointsDisplay(data.points);
  currentPoints = data.points;
  document.getElementById('sg-pull-btn').disabled = !!data.progress.defeated_at;
  sgLastProgress = data.progress;
  renderSgCost(data.pull_cost, data.free_left || 0);
  if (data.progress.defeated_at) {
    document.getElementById('sg-battle-log').textContent = sgMode === 'live' ? 'この敵は既に討伐済みです' : '討伐済みです。「最初から」で始め直せます';
  } else if ((data.progress.pending_gauge || []).length) {
    document.getElementById('sg-battle-log').innerHTML = `発動していないゲージ攻撃が ${data.progress.pending_gauge.length} 回分あります<button class="btn btn-primary btn-sm sg-gauge-resume" onclick="resumeSgGauges()">発動する</button>`;
  }
}

// ===== ゲージアクション =====
let sgGaugeTiers = null; // ギミックがゲージアクションのときだけ入る（[{ name, min, mult }]）
let sgGaugeAuto = 0.45;
const SG_GAUGE_COLORS = { PERFECT: '#ffd700', GREAT: '#49d6a8', GOOD: '#4fc3f7', MISS: '#8888aa' };
// バーの帯は重ねて描くので、半透明にすると色が混ざる。暗めの不透明色で描く
const SG_GAUGE_ZONE_COLORS = { PERFECT: '#c9a21c', GREAT: '#237a63', GOOD: '#1f4d66' };

// 判定幅（精度 = 1 - |位置|）をバーの色帯として描く
function renderSgGaugeZones() {
  const bar = document.getElementById('sg-gauge-bar');
  bar.querySelectorAll('.sg-gauge-zone').forEach(z => z.remove());
  [...sgGaugeTiers].reverse().forEach(t => {
    if (t.min <= 0) return;
    const half = (1 - t.min) * 50; // 位置|x|<=1-min の範囲を%に
    const z = document.createElement('div');
    z.className = 'sg-gauge-zone';
    z.style.cssText = `left:${50 - half}%;width:${half * 2}%;background:${SG_GAUGE_ZONE_COLORS[t.name] || SG_GAUGE_COLORS[t.name]}`;
    bar.insertBefore(z, document.getElementById('sg-gauge-marker')); // 外側(GOOD)から順に描き、内側を上に重ねる
  });
}

// マーカーが左右に往復するのをタップで止める。精度(0〜1)を返す。一定時間で自動（GOOD相当）
function playSgGauge(index, total) {
  return new Promise(resolve => {
    const overlay = document.getElementById('sg-gauge-overlay');
    const marker = document.getElementById('sg-gauge-marker');
    const result = document.getElementById('sg-gauge-result');
    const hint = document.getElementById('sg-gauge-hint');
    document.getElementById('sg-gauge-count').textContent = total > 1 ? `${index + 1}/${total}` : '';
    result.textContent = '';
    result.className = 'sg-gauge-result';
    const dmgEl = document.getElementById('sg-gauge-dmg');
    dmgEl.textContent = '';
    dmgEl.className = 'sg-gauge-dmg';
    hint.textContent = '中心に近いところでタップ！';
    renderSgGaugeZones();
    overlay.hidden = false;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const period = reduced ? 2400 : 1200;
    const start = performance.now();
    let pos = -1, raf = 0, done = false;
    const tick = now => {
      pos = -Math.cos(((now - start) / period) * Math.PI * 2);
      marker.style.left = ((pos + 1) / 2 * 100) + '%';
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const finish = (accuracy, auto) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      clearTimeout(autoTimer);
      overlay.removeEventListener('pointerdown', onTap);
      document.removeEventListener('keydown', onKey);
      hint.textContent = auto ? '時間切れ（自動発動）' : '';
      resolve(accuracy);
    };
    const onTap = e => { e.preventDefault(); finish(1 - Math.abs(pos), false); };
    const onKey = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); finish(1 - Math.abs(pos), false); } };
    const autoTimer = setTimeout(() => finish(sgGaugeAuto, true), 6000);
    // 直前のカードめくりのタップが誤って入らないよう少し待ってから受け付ける
    setTimeout(() => { if (!done) { overlay.addEventListener('pointerdown', onTap); document.addEventListener('keydown', onKey); } }, 250);
  });
}

// 発動待ちのゲージ攻撃を順に遊んでダメージを確定する
async function runSgGauges(tokens) {
  const out = { defeated: false, awarded_icon: null, progress: null, total: 0 };
  const overlay = document.getElementById('sg-gauge-overlay');
  for (let i = 0; i < tokens.length; i++) {
    const accuracy = await playSgGauge(i, tokens.length);
    let res;
    try {
      res = await apiFetch(sgApi('/gauge'), { method: 'POST', body: JSON.stringify({ token: tokens[i], accuracy }) });
    } catch (err) {
      overlay.hidden = true;
      showToast(err.message, 'error');
      break;
    }
    const result = document.getElementById('sg-gauge-result');
    result.textContent = `${res.tier}  ×${res.mult}`;
    result.style.color = SG_GAUGE_COLORS[res.tier];
    void result.offsetWidth;
    result.classList.add('pop');
    const dmgEl = document.getElementById('sg-gauge-dmg');
    dmgEl.textContent = res.dmg.toLocaleString('ja-JP');
    dmgEl.classList.add('pop');
    _sePlay('/sounds/gauge_hit.mp3'); // 判定に関係なく同じ打撃音
    sgBossReact({ category: 'damage', key: res.tier === 'PERFECT' ? 'ultra' : 'crit', dmg: res.dmg, overkill: res.overkill });
    renderSgHp(res.progress.current_hp, sgCurrentEnemy.max_hp);
    out.total += res.overkill ? 0 : res.dmg;
    out.progress = res.progress;
    if (res.defeated) { out.defeated = true; out.awarded_icon = res.awarded_icon; }
    await new Promise(r => setTimeout(r, 1100));
    overlay.hidden = true;
    await new Promise(r => setTimeout(r, 250));
  }
  overlay.hidden = true;
  return out;
}

// ページを開いたときに発動待ちが残っていたら、その場で発動できるようにする
async function resumeSgGauges() {
  const btn = document.getElementById('sg-pull-btn');
  const pending = (sgLastProgress && sgLastProgress.pending_gauge) || [];
  if (!pending.length) return;
  btn.disabled = true;
  const g = await runSgGauges(pending.map(p => p.token));
  document.getElementById('sg-battle-log').innerHTML = `ゲージ攻撃で <b>${g.total.toLocaleString('ja-JP')}</b> ダメージ`;
  await finishSgTurn(g.progress || sgLastProgress, g.defeated, g.awarded_icon);
}

let sgLastProgress = null;
// 1回分（10連＋ゲージ）の最後に画面を最新の状態にそろえる
async function finishSgTurn(progress, defeated, awardedIcon) {
  sgLastProgress = progress;
  if (defeated) await sgPlayDefeat();
  renderSgHp(progress.current_hp, sgCurrentEnemy.max_hp);
  renderSgShield(progress.shield);
  renderSgDestructionRate(progress.destruction_rate);
  renderSgEffects(progress);
  updateSgDefeatedUi(!!progress.defeated_at);
  renderSgRewind(progress);
  document.getElementById('sg-pull-btn').disabled = !!progress.defeated_at;
  document.getElementById('sg-reset-btn').disabled = !!progress.defeated_at;
  if (!progress.defeated_at) setSgPullCollapsed(false);
  if (defeated && !awardedIcon && sgMode === 'test') document.getElementById('sg-battle-log').innerHTML += '<br>テストの敵を討伐しました（アイコンはもらえません）';
  if (defeated && sgMode === 'play') document.getElementById('sg-battle-log').innerHTML += '<br>遊びモードで討伐しました。「最初から」でもう一度遊べます';
  if (defeated && awardedIcon) {
    document.getElementById('sg-ssr-icon-img').src = awardedIcon.image_url;
    document.getElementById('sg-ssr-name').textContent = `限定アイコン「${awardedIcon.name}」を獲得！`;
    const flip = document.getElementById('sg-ssr-flip');
    flip.classList.remove('flipped');
    document.getElementById('sg-defeat-overlay').classList.add('show');
    setTimeout(() => { flip.classList.add('flipped'); _sePlay('/sounds/ss_sound.mp3'); }, sgT(900));
  }
}

let sgRatesLoaded = false;
async function toggleSgRates() {
  const panel = document.getElementById('sg-rates-panel');
  const arrow = document.getElementById('sg-rates-arrow');
  const opening = !panel.classList.contains('open');

  if (opening && !sgRatesLoaded) {
    try {
      const data = await apiFetch('/special-gacha/rates' + (sgTestGimmick ? `?gimmick=${encodeURIComponent(sgTestGimmick)}` : ''));
      const gimmickNote = data.gimmick && data.gimmick.key !== 'normal'
        ? `<div class="sg-rates-group"><div class="sg-rates-group-title">ギミック: ${escHtml(data.gimmick.label)}</div><div class="sg-rates-group-p">${escHtml(data.gimmick.description)}</div></div>`
        : '';
      panel.innerHTML = gimmickNote + data.categories.map(cat => `
        <div class="sg-rates-group">
          <div class="sg-rates-group-title">${escHtml(cat.label)}</div>
          <div class="sg-rates-group-p">1段階目の抽選率: ${(cat.p * 100).toFixed(0)}%</div>
          ${cat.items.map(it => `
            <div class="sg-rates-row">
              <span class="rlabel">${escHtml(it.label)}<br><span class="rdetail">${escHtml(it.detail)}</span></span>
              <span class="rp">${(it.p * 100).toFixed(0)}%</span>
            </div>`).join('')}
        </div>`).join('');
      sgRatesLoaded = true;
    } catch (err) {
      panel.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
    }
  }

  panel.hidden = false;
  // hiddenを外した直後にopenを付けないとtransitionが効かないので1フレーム遅らせる
  requestAnimationFrame(() => {
    panel.classList.toggle('open', opening);
    arrow.textContent = opening ? '▴' : '▾';
    if (!opening) setTimeout(() => { panel.hidden = true; }, 350);
  });
}

// カードの中身を文字ではなく絵(アイコン)で表現する。key: サーバーから返る効果キー
const SG_ICON_MAP = {
  ally_small: ['sword', 'up1'], ally_large: ['sword', 'up2'],
  debuff_small: ['shield', 'down1'], debuff_large: ['shield', 'down2'],
  enemybuff_small: ['shield', 'up1'], enemybuff_large: ['shield', 'up2'],
  critup_small: ['star', null], critup_large: ['star3', null],
  heal_small: ['heart', null], heal_large: ['heart2', null],
  shield_break_small: ['barrier', 'down1'], shield_break_medium: ['barrier', 'down2'], shield_break_large: ['barrier', 'down2'],
  shield_regen_small: ['barrier', 'up1'], shield_regen_large: ['barrier', 'up2'],
};

// 手描きの線画アイコン(SVG)。currentColorでカテゴリ色を継承する。
const SG_SVG_BASE = {
  target: '<path d="M12 2.5a9.5 9.5 0 1 0 0 19a9.5 9.5 0 1 0 0-19zM12 5.5a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13z" fill-rule="evenodd"/><circle cx="12" cy="12" r="3"/>',
  barrier: '<path d="M12 2 L20.5 7 V17 L12 22 L3.5 17 V7 Z" fill-opacity="0.35"/><path d="M12 2 L20.5 7 V17 L12 22 L3.5 17 V7 Z M12 4.3 L5.5 8.1 V15.9 L12 19.7 L18.5 15.9 V8.1 Z" fill-rule="evenodd"/>',
  sword: '<path d="M12 2 L14.2 4.2 L14.2 15 L12 17.2 L9.8 15 L9.8 4.2 Z"/><rect x="6.5" y="14.2" width="11" height="2" rx="0.5"/><rect x="11" y="16.5" width="2" height="5.5" rx="0.6"/><circle cx="12" cy="22.3" r="1.4"/>',
  shield: '<path d="M12 2 L19.5 5 V11 C19.5 16 16 19.8 12 21.5 C8 19.8 4.5 16 4.5 11 V5 Z"/>',
  star: '<path d="M12 1.5 L14 9.5 L22 12 L14 14.5 L12 22.5 L10 14.5 L2 12 L10 9.5 Z"/>',
  star3: '<g transform="translate(7,7)"><path d="M0 -4 L1.2 -1.2 L4 0 L1.2 1.2 L0 4 L-1.2 1.2 L-4 0 L-1.2 -1.2 Z"/></g><g transform="translate(17,7)"><path d="M0 -4 L1.2 -1.2 L4 0 L1.2 1.2 L0 4 L-1.2 1.2 L-4 0 L-1.2 -1.2 Z"/></g><g transform="translate(12,17)"><path d="M0 -4 L1.2 -1.2 L4 0 L1.2 1.2 L0 4 L-1.2 1.2 L-4 0 L-1.2 -1.2 Z"/></g>',
  heart: '<path d="M12 20.5 C12 20.5 4.5 14.8 4.5 9.3 C4.5 6.3 6.8 4.3 9.3 4.3 C10.7 4.3 11.6 5 12 5.8 C12.4 5 13.3 4.3 14.7 4.3 C17.2 4.3 19.5 6.3 19.5 9.3 C19.5 14.8 12 20.5 12 20.5 Z"/>',
  heart2: '<g transform="translate(-3,1) scale(0.72)"><path d="M12 20.5 C12 20.5 4.5 14.8 4.5 9.3 C4.5 6.3 6.8 4.3 9.3 4.3 C10.7 4.3 11.6 5 12 5.8 C12.4 5 13.3 4.3 14.7 4.3 C17.2 4.3 19.5 6.3 19.5 9.3 C19.5 14.8 12 20.5 12 20.5 Z"/></g><g transform="translate(6,4) scale(0.72)"><path d="M12 20.5 C12 20.5 4.5 14.8 4.5 9.3 C4.5 6.3 6.8 4.3 9.3 4.3 C10.7 4.3 11.6 5 12 5.8 C12.4 5 13.3 4.3 14.7 4.3 C17.2 4.3 19.5 6.3 19.5 9.3 C19.5 14.8 12 20.5 12 20.5 Z"/></g>',
  burst: '<path d="M12 1 L14.9 8 L22.5 8.6 L16.8 13.6 L18.5 20.9 L12 17 L5.5 20.9 L7.2 13.6 L1.5 8.6 L9.1 8 Z"/>',
};
const SG_SVG_BADGE = {
  up1: '<path d="M4 15 L12 7 L20 15" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  up2: '<path d="M4 12 L12 5 L20 12" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20 L12 13 L20 20" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  down1: '<path d="M4 9 L12 17 L20 9" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  down2: '<path d="M4 4 L12 11 L20 4" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12 L12 19 L20 12" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
};

function sgSvg(name) {
  return `<svg viewBox="0 0 24 24" fill="currentColor" class="sg-svg-icon">${SG_SVG_BASE[name]}</svg>`;
}
function sgBadgeSvg(name) {
  return `<svg viewBox="0 0 24 24" class="sg-svg-badge">${SG_SVG_BADGE[name]}</svg>`;
}

function sgCardVisual(r) {
  if (r.category === 'damage' && r.blocked) {
    return { icon: sgSvg('barrier'), val: `<span class="sg-dmg-num${String(r.blocked_dmg).length >= 5 ? ' is-long' : ''}">${r.blocked_dmg}</span><span class="sg-dmg-label">防がれた</span>` };
  }
  if (r.category === 'gauge') {
    return { icon: sgSvg('target'), val: 'ゲージ攻撃' };
  }
  if (r.category === 'damage' && r.overkill) {
    return { icon: sgSvg('sword'), val: `<span class="sg-dmg-num${String(r.dmg).length >= 5 ? ' is-long' : ''}">${r.dmg}</span><span class="sg-dmg-label">オーバーキル</span>` };
  }
  if (r.category === 'damage') {
    return { icon: sgSvg('sword'), val: `<span class="sg-dmg-num${String(r.dmg).length >= 5 ? ' is-long' : ''}">${r.dmg}</span><span class="sg-dmg-label">ダメージ</span>` };
  }
  const label = r.label.replace(/[()]/g, '');
  if (r.category === 'destruction') {
    return { icon: sgSvg('burst'), val: `破壊率<br>+${r.amount}%` };
  }
  const [base, badge] = SG_ICON_MAP[r.key] || ['star', null];
  const iconHtml = sgSvg(base) + (badge ? sgBadgeSvg(badge) : '');
  // シールドの増減は量が大事なので数字で見せる（破壊率カードと同じ形）
  if (r.key && r.key.startsWith('shield_')) {
    const sign = r.key.startsWith('shield_regen') ? '+' : '-';
    return { icon: `<span class="sg-icon-stack">${iconHtml}</span>`, val: `シールド<br>${sign}${r.amount}` };
  }
  return { icon: `<span class="sg-icon-stack">${iconHtml}</span>`, val: label };
}

// 通常ガチャのanimatePull()と同じ演出(カード出現→タップでスキップ→めくり音→フリップ)を流用し、
// レアリティ判定・フェイクアウト・SS/S演出だけを省いたもの。
async function animateSpecialPull(results) {
  const stage = document.getElementById('sg-stage');
  stage.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'gacha-cards';
  stage.appendChild(wrap);

  const cardEls = [];
  const instant = sgSpeed === 'instant';
  results.forEach((r, i) => {
    const isBigDamage = r.category === 'damage' && r.key === 'ultra' && !r.blocked;
    const isLargeEffect = (r.key && r.key.endsWith('_large')) || r.key === 'destruction_100';
    const cls = `cat-${r.category}` + (r.blocked ? ' is-blocked' : '') + ((isBigDamage || isLargeEffect) ? ' sg-glow' : '');
    const { icon, val } = sgCardVisual(r);
    const card = document.createElement('div');
    card.className = 'g-card';
    const multTag = sgRwMultNow > 1 && r.category === 'damage' && r.dmg > 0 && !r.blocked ? `<span class="sg-mult-tag">×${sgRwMultNow}</span>` : '';
    card.innerHTML = `
      <div class="g-card-inner" id="sg-gc-${i}">
        <div class="g-card-front"><img src="/img/logo.png" alt="" style="width:70%;height:70%;object-fit:contain;opacity:0.7"></div>
        <div class="g-card-back sg-card-back ${cls}">
          ${r.overkill ? '<span class="sg-overkill-tag">OVERKILL</span>' : ''}
          ${multTag}
          <div class="sg-card-icon">${icon}</div>
          ${val ? `<div class="sg-card-val">${val}</div>` : ''}
        </div>
      </div>`;
    wrap.appendChild(card);
    cardEls.push(card);
  });

  // 結果だけ：カードを表にして並べ、最後の状態だけ出す
  if (instant) {
    cardEls.forEach((c, i) => { c.classList.add('card-visible'); document.getElementById(`sg-gc-${i}`).classList.add('flipped'); });
    const last = results[results.length - 1];
    if (last) {
      renderSgHp(last.hp_after, sgCurrentEnemy.max_hp);
      if (last.state_after) { renderSgEffects(last.state_after); renderSgDestructionRate(last.state_after.destruction_rate); renderSgShield(last.state_after.shield, true); }
    }
    return;
  }

  // フェーズ1: カードを1枚ずつ表示（タップで即時全表示）
  await new Promise(resolve => {
    let idx = 0;
    let timer = null;
    let done = false;

    const showAll = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      cardEls.forEach(c => c.classList.add('card-visible'));
      stage.style.cursor = '';
      stage.removeEventListener('click', onTap);
      setTimeout(resolve, sgT(1000));
    };
    const showNext = () => {
      if (done) return;
      _sePlay('/sounds/putcard.mp3');
      cardEls[idx].classList.add('card-visible');
      idx++;
      if (idx >= results.length) {
        done = true;
        stage.style.cursor = '';
        stage.removeEventListener('click', onTap);
        setTimeout(resolve, sgT(1000));
      } else {
        timer = setTimeout(showNext, sgT(220));
      }
    };
    const onTap = () => showAll();
    stage.style.cursor = 'pointer';
    stage.addEventListener('click', onTap);
    timer = setTimeout(showNext, sgT(80));
  });

  // フェーズ2: 1枚ずつめくる（タップでスキップ＝間隔短縮）
  let skipFlip = false;
  const onSkipTap = () => { skipFlip = true; stage.removeEventListener('click', onSkipTap); stage.style.cursor = ''; };
  stage.style.cursor = 'pointer';
  stage.addEventListener('click', onSkipTap);

  const stagger = results.length === 1 ? 0 : sgT(500);
  for (let i = 0; i < results.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, skipFlip ? 30 : stagger));
    _sePlay('/sounds/turn.mp3');
    await new Promise(r => setTimeout(r, sgT(100)));
    document.getElementById(`sg-gc-${i}`).classList.add('flipped');
    sgBossReact(results[i]);
    sgAttackFx(results[i], cardEls[i]);
    // 大ダメージは一瞬止める（ヒットストップ）
    if (results[i].category === 'damage' && results[i].key === 'ultra' && !results[i].blocked && !skipFlip) await sgSleep(sgT(260));
    renderSgHp(results[i].hp_after, sgCurrentEnemy.max_hp);
    if (results[i].state_after) {
      renderSgEffects(results[i].state_after);
      renderSgDestructionRate(results[i].state_after.destruction_rate);
      renderSgShield(results[i].state_after.shield, true);
    }
  }

  stage.removeEventListener('click', onSkipTap);
  stage.style.cursor = '';
  await new Promise(r => setTimeout(r, sgT(700)));
}

function setSgPullCollapsed(collapsed) {
  document.getElementById('sg-pull-wrap').classList.toggle('is-collapsed', collapsed);
}

// reset：巻き戻しギミックで、連続をリセットしてから引く
async function doSpecialPull(reset = false) {
  const btn = document.getElementById('sg-pull-btn');
  btn.disabled = true;
  document.getElementById('sg-reset-btn').disabled = true;
  setSgPullCollapsed(true);
  // 巻き戻し：この10連の倍率（カードに添える）。自分でリセットしたら CHAIN RELEASE を見せてから引く
  const k = sgRewind && sgLastProgress && !reset ? sgLastProgress.rewind_streak || 0 : 0;
  sgRwMultNow = sgRewind ? 1 + sgRewind.dmg_step * k : 1;
  if (sgRewind && reset) {
    sgRwPop('CHAIN RELEASE', 'ダメージ×1・巻き戻し確率0%', 'is-release');
    renderSgRewind({ ...sgLastProgress, rewind_streak: 0, rewind_dmg: 0 });
    await sgSleep(sgT(700));
  }
  // この10連で削る分も巻き戻しの対象なので、仮のバーの上端は連続が始まったときのHP
  if (sgRewind && sgLastProgress) sgRwTop = sgLastProgress.current_hp + (reset ? 0 : sgLastProgress.rewind_dmg || 0);
  try {
    const data = await apiFetch(sgApi('/pull'), { method: 'POST', body: JSON.stringify({ reset: reset === true }) });
    await animateSpecialPull(data.results);
    await sgPlayTotal(data.results.reduce((n, r) => n + (r.dmg > 0 && !r.overkill ? r.dmg : 0), 0));
    await sgRewindCheck(data.rewind_check);
    await sgPlayRewind(data.rewind, data.rewind_check, data.progress);
    // ゲージアクション：10枚めくり終わったら、チャージしたゲージ攻撃を順に発動
    const gauge = await runSgGauges(data.results.filter(r => r.gauge_token).map(r => r.gauge_token));
    const progress = gauge.progress || data.progress;
    const defeated = data.defeated || gauge.defeated;
    const awardedIcon = data.awarded_icon || gauge.awarded_icon;

    const totalDmg = data.results.reduce((s, r) => s + (r.dmg > 0 && !r.overkill ? r.dmg : 0), 0);
    const overkillDmg = data.results.reduce((s, r) => s + (r.dmg > 0 && r.overkill ? r.dmg : 0), 0);
    const blockedCount = data.results.filter(r => r.blocked).length;
    const notes = [];
    if (blockedCount) notes.push(`シールドに ${blockedCount} 回防がれた`);
    if (gauge.total) notes.push(`ゲージ攻撃 ${gauge.total.toLocaleString('ja-JP')}`);
    if (data.leftover_gauge_damage) notes.push(`前回のゲージ攻撃 ${data.leftover_gauge_damage.toLocaleString('ja-JP')}`);
    if (overkillDmg) notes.push(`オーバーキル ${overkillDmg.toLocaleString('ja-JP')}`);
    if (data.rewind && data.rewind.type === 'rewind') notes.push('敵の巻き戻しで、この連続で削った分が戻った');
    if (data.rewind && data.rewind.type === 'forced') notes.push('巻き戻しの確率が100%に届き、連続がリセット');
    document.getElementById('sg-battle-log').innerHTML = `今回の10連で <b>${(totalDmg + gauge.total).toLocaleString('ja-JP')}</b> ダメージ` + (notes.length ? `（${notes.join('・')}）` : '');
    currentPoints = data.new_points;
    updatePointsDisplay(currentPoints);
    if (data.free_left !== undefined) renderSgCost(undefined, data.free_left);
    await finishSgTurn(progress, defeated, awardedIcon);
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    document.getElementById('sg-reset-btn').disabled = false;
    setSgPullCollapsed(false);
  }
}
