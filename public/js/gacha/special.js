// ===== 討伐ガチャ（期間限定） =====
let sgCurrentEnemy = null;
let sgLoaded = false;

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
  wrap.classList.add('is-dying');
  await new Promise(r => setTimeout(r, 950));
  wrap.classList.remove('is-dying');
  wrap.classList.add('is-defeated');
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

function renderSgGimmick(gimmick) {
  const el = document.getElementById('sg-gimmick');
  sgMaxShield = gimmick ? gimmick.max_shield : 0;
  sgGaugeTiers = gimmick && gimmick.gauge ? gimmick.gauge.tiers : null;
  if (gimmick && gimmick.gauge) sgGaugeAuto = gimmick.gauge.auto_accuracy;
  sgMaxDestruction = gimmick && gimmick.max_destruction ? Number(gimmick.max_destruction) : 999.0;
  el.hidden = !gimmick || gimmick.key === 'normal';
  if (el.hidden) return;
  document.getElementById('sg-gimmick-tag').textContent = gimmick.label;
}

async function loadSpecialGacha() {
  try {
    const data = await apiFetch('/special-gacha/current');
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
    renderSgHp(data.progress.current_hp, data.enemy.max_hp);
    renderSgShield(data.progress.shield);
    renderSgDestructionRate(data.progress.destruction_rate);
    renderSgEffects(data.progress);
    updateSgDefeatedUi(!!data.progress.defeated_at);
    updatePointsDisplay(data.points);
    currentPoints = data.points;
    document.getElementById('sg-pull-btn').disabled = !!data.progress.defeated_at;
    sgLastProgress = data.progress;
    if (data.progress.defeated_at) {
      document.getElementById('sg-battle-log').textContent = 'この敵は既に討伐済みです';
    } else if ((data.progress.pending_gauge || []).length) {
      document.getElementById('sg-battle-log').innerHTML = `発動していないゲージ攻撃が ${data.progress.pending_gauge.length} 回分あります<button class="btn btn-primary btn-sm sg-gauge-resume" onclick="resumeSgGauges()">発動する</button>`;
    }
  } catch (err) {
    document.getElementById('sg-boss-name').textContent = '読み込みに失敗しました';
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
      res = await apiFetch('/special-gacha/gauge', { method: 'POST', body: JSON.stringify({ token: tokens[i], accuracy }) });
    } catch (err) {
      overlay.hidden = true;
      showAlert('#alert', err.message);
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
  document.getElementById('sg-pull-btn').disabled = !!progress.defeated_at;
  if (!progress.defeated_at) setSgPullCollapsed(false);
  if (defeated && awardedIcon) {
    document.getElementById('sg-ssr-icon-img').src = awardedIcon.image_url;
    document.getElementById('sg-ssr-name').textContent = `限定アイコン「${awardedIcon.name}」を獲得！`;
    document.getElementById('sg-defeat-overlay').classList.add('show');
  }
}

let sgRatesLoaded = false;
async function toggleSgRates() {
  const panel = document.getElementById('sg-rates-panel');
  const arrow = document.getElementById('sg-rates-arrow');
  const opening = !panel.classList.contains('open');

  if (opening && !sgRatesLoaded) {
    try {
      const data = await apiFetch('/special-gacha/rates');
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
  results.forEach((r, i) => {
    const isBigDamage = r.category === 'damage' && r.key === 'ultra' && !r.blocked;
    const isLargeEffect = (r.key && r.key.endsWith('_large')) || r.key === 'destruction_100';
    const cls = `cat-${r.category}` + (r.blocked ? ' is-blocked' : '') + ((isBigDamage || isLargeEffect) ? ' sg-glow' : '');
    const { icon, val } = sgCardVisual(r);
    const card = document.createElement('div');
    card.className = 'g-card';
    card.innerHTML = `
      <div class="g-card-inner" id="sg-gc-${i}">
        <div class="g-card-front"><img src="/img/logo.png" alt="" style="width:70%;height:70%;object-fit:contain;opacity:0.7"></div>
        <div class="g-card-back sg-card-back ${cls}">
          ${r.overkill ? '<span class="sg-overkill-tag">OVERKILL</span>' : ''}
          <div class="sg-card-icon">${icon}</div>
          ${val ? `<div class="sg-card-val">${val}</div>` : ''}
        </div>
      </div>`;
    wrap.appendChild(card);
    cardEls.push(card);
  });

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
      setTimeout(resolve, 1000);
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
        setTimeout(resolve, 1000);
      } else {
        timer = setTimeout(showNext, 220);
      }
    };
    const onTap = () => showAll();
    stage.style.cursor = 'pointer';
    stage.addEventListener('click', onTap);
    timer = setTimeout(showNext, 80);
  });

  // フェーズ2: 1枚ずつめくる（タップでスキップ＝間隔短縮）
  let skipFlip = false;
  const onSkipTap = () => { skipFlip = true; stage.removeEventListener('click', onSkipTap); stage.style.cursor = ''; };
  stage.style.cursor = 'pointer';
  stage.addEventListener('click', onSkipTap);

  const stagger = results.length === 1 ? 0 : 500;
  for (let i = 0; i < results.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, skipFlip ? 30 : stagger));
    _sePlay('/sounds/turn.mp3');
    await new Promise(r => setTimeout(r, 100));
    document.getElementById(`sg-gc-${i}`).classList.add('flipped');
    sgBossReact(results[i]);
    renderSgHp(results[i].hp_after, sgCurrentEnemy.max_hp);
    if (results[i].state_after) {
      renderSgEffects(results[i].state_after);
      renderSgDestructionRate(results[i].state_after.destruction_rate);
      renderSgShield(results[i].state_after.shield, true);
    }
  }

  stage.removeEventListener('click', onSkipTap);
  stage.style.cursor = '';
  await new Promise(r => setTimeout(r, 700));
}

function setSgPullCollapsed(collapsed) {
  document.getElementById('sg-pull-wrap').classList.toggle('is-collapsed', collapsed);
}

async function doSpecialPull() {
  const btn = document.getElementById('sg-pull-btn');
  btn.disabled = true;
  setSgPullCollapsed(true);
  try {
    const data = await apiFetch('/special-gacha/pull', { method: 'POST' });
    await animateSpecialPull(data.results);
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
    document.getElementById('sg-battle-log').innerHTML = `今回の10連で <b>${(totalDmg + gauge.total).toLocaleString('ja-JP')}</b> ダメージ` + (notes.length ? `（${notes.join('・')}）` : '');
    currentPoints = data.new_points;
    updatePointsDisplay(currentPoints);
    await finishSgTurn(progress, defeated, awardedIcon);
  } catch (err) {
    showAlert('#alert', err.message);
    btn.disabled = false;
    setSgPullCollapsed(false);
  }
}
