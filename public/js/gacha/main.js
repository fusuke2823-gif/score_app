// ガチャページ本体：ガチャの選択・引く・GP交換・所持アイコン・排出対象モーダル
// 読み込み順：sound.js → fx.js → special.js → main.js（最後に init() を呼ぶ）
renderNav();
applyI18n();
if (!requireLogin()) throw new Error('redirect');

// 通常ガチャ / 討伐ガチャの切り替え（このページはログイン必須なので全員に表示）
document.getElementById('gacha-type-tabs').style.display = 'flex';
document.getElementById('tab-btn-special').style.display = '';

let gSettings = null;
let gBaseSettings = null; // 標準のガチャ設定。gSettings は選んでいるガチャの上書きを重ねたもの
// 選んだガチャの確率・コスト（上書きのない項目は標準のまま、Aは100から引いた残り）
function poolSettings(p) {
  const b = gBaseSettings || {};
  if (!p) return b;
  const v = (x, d) => (x === null || x === undefined ? d : +x);
  const ss = v(p.ss_rate, +b.ss_rate), s = v(p.s_rate, +b.s_rate);
  const rateChanged = p.ss_rate != null || p.s_rate != null;
  return { ...b, ss_rate: ss, s_rate: s, a_rate: rateChanged ? Math.max(0, +(100 - ss - s).toFixed(3)) : b.a_rate,
    single_cost: v(p.single_cost, b.single_cost), multi_cost: v(p.multi_cost, b.multi_cost), last_guarantee: p.last_guarantee === 'SS' ? 'SS' : 'S' };
}
let isPulling = false;
let currentPoints = 0;
let currentGp = 0;

let selectedPoolId = null;
let gPools = [];

async function init() {
  ['/sounds/turn.mp3','/sounds/ss_sound.mp3','/sounds/s_sound.mp3','/sounds/putcard.mp3','/sounds/gauge_hit.mp3'].forEach(_sePreload);
  try {
    const [settings, myData, pools] = await Promise.all([
      apiFetch('/gacha/settings'),
      apiFetch('/gacha/my'),
      apiFetch('/gacha/pools')
    ]);
    gBaseSettings = settings;
    gSettings = settings;
    gPools = pools;
    currentPoints = myData.points;
    currentGp = myData.gp || 0;
    updatePointsDisplay(currentPoints);
    updateGpDisplay(currentGp);
    renderPoolSelector(pools);
    loadExchangeList();

    // GP移行（未移行の場合のみ）
    try {
      const migRes = await apiFetch('/gacha/gp-migrate', { method: 'POST' });
      if (!migRes.already_done && migRes.gp_awarded > 0) {
        currentGp = migRes.new_gp;
        updateGpDisplay(currentGp);
        showGpToast(t('gacha.gp_migrated', migRes.gp_awarded));
      }
    } catch (_) {}

    // 選んでいるガチャの確率・ピックアップで出す（ガチャがなければ標準）
    const selPool = gPools.find(x => x.id === selectedPoolId);
    updateRateInfo(gSettings, selPool ? (selPool.pickup_icons || []) : []);
    updatePullButtons();

    refreshPullButtons();

    renderMyIcons(myData.icons);
  } catch (err) {
    showAlert('#alert', err.message);
  }
}

// 単発・10連のボタン：画像の下の帯に、選んでいるガチャのコストを重ねる
const PULL_BTN_IMG = { single: '/img/gacha_btn_single.webp', multi: '/img/gacha_btn_multi.webp' };
// 10連は最後の1枚の確定（S以上／SS）も添える
const pullCostText = (type, cost, guarantee = gSettings?.last_guarantee) => (cost == null ? '' : type === 'multi' ? `${cost}pt<small>${guarantee === 'SS' ? 'SSレア確定' : 'Sレア以上確定'}</small>` : `${cost}pt`);
// 選んでいるガチャで、あと何回引けるか（回数制限がなければ Infinity）
function pullsLeft() {
  const p = gPools.find(x => x.id === selectedPoolId);
  return p && p.pull_limit != null ? Math.max(0, p.pull_limit - (p.my_pulls || 0)) : Infinity;
}
// 解放条件のあるガチャ：満たしていなければ鍵（引くボタンの代わりに条件と、イベントごとの達成状況を出す）
const ENTRY_LOCK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const isLocked = p => !!(p && p.entry && !p.entry.met);
function renderEntryBox(p) {
  let el = document.getElementById('gx-entry');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gx-entry';
    document.querySelector('.gacha-pull-btns').insertAdjacentElement('beforebegin', el);
  }
  el.hidden = !(p && p.entry);
  if (el.hidden) return;
  const e = p.entry;
  const text = escHtml(entryCondText(e));
  if (e.met) {
    el.className = 'gx-entry is-met';
    el.innerHTML = `<span class="gx-entry-ico">${CHECK_SVG}</span><span>解放条件を達成しています<small>${text}</small></span>`;
    return;
  }
  const need = e.min_attrs || 1;
  const total = e.count === 'total';
  el.className = 'gx-entry is-locked';
  el.innerHTML = `
    <div class="gx-entry-head">${ENTRY_LOCK_SVG}解放条件</div>
    <div class="gx-entry-text">${text}</div>
    <ul class="gx-entry-evs">${e.events.map(ev => `
      <li class="${ev.ok ? 'ok' : ''}">
        <span class="gx-entry-mark">${ev.ok ? CHECK_SVG : ''}</span>
        <span class="gx-entry-ev">${escHtml(ev.name || '')}</span>
        <span class="gx-entry-got">${ev.attrs.length ? `${ev.attrs.map(escHtml).join('・')}${need > 1 && !total ? `（${Math.min(ev.attrs.length, need)}/${need}）` : ''}` : '未投稿'}</span>
      </li>`).join('')}</ul>
    ${total ? `<div class="gx-entry-total">合計 <b>${Math.min(e.total || 0, need)}</b> / ${need}属性分</div>` : ''}
    <div class="gx-entry-note">スコアが承認されると引けるようになります</div>`;
}
// ボタンの押せる・押せないと、回数制限の表示（引ける種類以外のボタンは隠す）
function refreshPullButtons() {
  const p = gPools.find(x => x.id === selectedPoolId);
  const left = pullsLeft();
  const locked = isLocked(p);
  renderEntryBox(p);
  [['single', 'btn-single'], ['multi', 'btn-multi']].forEach(([type, id]) => {
    const btn = document.getElementById(id);
    btn.hidden = locked || !!(p && p.pull_types && p.pull_types !== type);
    btn.disabled = isPulling || left <= 0 || locked;
  });
  let el = document.getElementById('gx-pull-limit');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gx-pull-limit';
    el.className = 'gx-pull-limit';
    document.querySelector('.gacha-pull-btns').insertAdjacentElement('afterend', el);
  }
  el.hidden = !(p && p.pull_limit != null) || locked;
  if (!el.hidden) el.innerHTML = left > 0 ? `1人${p.pull_limit}回まで　<b>残り${left}回</b>` : `1人${p.pull_limit}回まで　<b>上限まで引きました</b>`;
}
function updatePullButtons() {
  if (!gSettings) return;
  [['single', 'btn-single'], ['multi', 'btn-multi']].forEach(([type, id]) => {
    const btn = document.getElementById(id);
    const cost = gSettings[type + '_cost'];
    btn.querySelector('.gbtn-cost').innerHTML = pullCostText(type, cost);
    btn.querySelector('img').alt = `${type === 'multi' ? '10連' : '単発'}ガチャ ${cost}pt`;
  });
  refreshPullButtons();
}

function updateRateInfo(settings, pickupIcons) {
  const zh = getLang() === 'zh';
  const ssRate = +settings.ss_rate, sRate = +settings.s_rate, aRate = +settings.a_rate;
  const puCount = pickupIcons.length;
  const pct = v => `${(+v).toFixed(2).replace(/\.?0+$/, '')}<small>%</small>`;
  const bar = `<i class="rb-SS" style="width:${ssRate}%"></i><i class="rb-S" style="width:${sRate}%"></i><i class="rb-A" style="width:${aRate}%"></i>`;
  document.getElementById('gx-rate-mini').innerHTML = bar;
  const row = (rar, label, v) => `
    <div class="gx-rate-row"><span class="gx-rate-rar r-${rar}">${rar}</span><span class="gx-rate-label">${label}</span><span class="gx-rate-pct">${pct(v)}</span></div>`;
  let pu = '';
  if (puCount > 0) {
    const normalRate = Math.max(0, ssRate - puCount * 0.75);
    pu = `
      <div class="gx-rate-pu">
        <div class="gx-rate-pu-head"><span>PICK UP</span><span>${zh ? '各' : '各'}0.75%</span></div>
        <div class="gx-rate-pu-icons">${pickupIcons.map(p => `<img src="${escHtml(thumbUrl(p.image_url))}" alt="${escHtml(p.name)}" title="${escHtml(p.name)}">`).join('')}</div>
        <div class="gx-rate-pu-rest"><span>${zh ? '通常SS（均等）' : '通常SS（均等）'}</span><span>${normalRate.toFixed(2)}%</span></div>
      </div>`;
  }
  const ssLast = settings.last_guarantee === 'SS';
  const rateNote = zh
    ? `${puCount > 0 ? 'PickUpSSは各0.75%。' : ''}稀度內機率均等。${ssLast ? '十連最後1枚SS保底。' : '十連最後1枚A→S保底。'}`
    : `${puCount > 0 ? 'PickUpのSSは各0.75%。' : ''}レアリティ内の確率は均等。${ssLast ? '10連の最後の1枚はSS確定です。' : '10連の最後の1枚はAがSに変わります。'}`;
  document.getElementById('rate-info').innerHTML = `
    <div class="gx-rate-bar">${bar}</div>
    ${row('SS', puCount > 0 ? 'PickUp含む' : '', ssRate)}
    ${pu}
    ${row('S', '', sRate)}
    ${row('A', '', aRate)}
    <p class="gx-rate-note">${rateNote}</p>`;
}

function updatePointsDisplay(pts) {
  document.getElementById('my-points').textContent = Number(pts).toLocaleString('ja-JP');
}
function updateGpDisplay(gp) {
  document.getElementById('my-gp').textContent = Number(gp).toLocaleString('ja-JP');
}

function poolDaysLabel(end_at) {
  if (!end_at) return '';
  const now = Date.now();
  const end = new Date(end_at).getTime();
  const diff = end - now;
  if (diff <= 0) return '';
  const totalHours = diff / (1000 * 60 * 60);
  if (totalHours < 24) {
    const h = Math.ceil(totalHours);
    return `<span style="font-size:0.72rem;font-weight:bold;color:#ff9800">${t('gacha.hours_left', h)}</span>`;
  }
  const days = Math.ceil(totalHours / 24);
  const color = days <= 3 ? '#ff9800' : 'var(--text-muted)';
  return `<span style="font-size:0.72rem;font-weight:bold;color:${color}">${t('gacha.days_left', days)}</span>`;
}

// 画像のないプールの背景色（プールごとに色を変えて並んだときに単調にならないように）
const POOL_FALLBACK_BG = [
  'linear-gradient(135deg, #2a1d55 0%, #162447 55%, #0b1a33 100%)',
  'linear-gradient(135deg, #4a1433 0%, #2a1240 55%, #120b2a 100%)',
  'linear-gradient(135deg, #0e3b4d 0%, #14305a 55%, #0b1a33 100%)',
  'linear-gradient(135deg, #3d2a10 0%, #3a1630 55%, #140b24 100%)',
];

function poolTimeChip(end_at) {
  if (!end_at) return '';
  const hours = (new Date(end_at).getTime() - Date.now()) / (1000 * 60 * 60);
  if (hours <= 0) return '';
  const text = hours < 24 ? t('gacha.hours_left', Math.ceil(hours)) : t('gacha.days_left', Math.ceil(hours / 24));
  const clock = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  return `<span class="pool-chip${hours <= 72 ? ' is-hot' : ''}">${clock}${text}</span>`;
}

// ピックアップを扇状に並べる（画像のないプールの背景用）。右に行くほど上に重ねる
function poolFanHTML(pickups) {
  const icons = pickups.slice(0, 5);
  const mid = (icons.length - 1) / 2;
  return `<div class="pool-fan">${icons.map((pu, i) => {
    const d = i - mid;
    const style = `transform:translateX(${-50 + d * 62}%) translateY(${Math.abs(d) * 9}%) rotate(${d * 7}deg);z-index:${10 + i}`;
    return `<img src="${escHtml(thumbUrl(pu.image_url))}" alt="" style="${style}">`;
  }).join('')}</div>`;
}

function poolBannerHTML(p, idx) {
  const pickups = p.pickup_icons || [];
  const isLimited = !!p.end_at;
  let visual;
  if (p.image_url) {
    visual = `<div class="pool-banner-bg" style="background-image:url('${escHtml(mediumUrl(p.image_url))}')"></div>`;
  } else {
    visual = `<div class="pool-banner-bg" style="background-image:${POOL_FALLBACK_BG[idx % POOL_FALLBACK_BG.length]}"></div>`
      + (pickups.length ? poolFanHTML(pickups) : `<div class="pool-mark">${uiIcon('sparkle', 150)}</div>`);
  }
  // バナー画像があるときだけ右下にピックアップを並べる（画像なしは扇で見せているので重複させない）
  const puStack = p.image_url && pickups.length ? `
    <div class="pool-pus">
      ${pickups.slice(0, 3).map(pu => `<img src="${escHtml(thumbUrl(pu.image_url))}" alt="" title="${escHtml(pu.name)}">`).join('')}
      ${pickups.length > 3 ? `<span>+${pickups.length - 3}</span>` : ''}
    </div>` : '';
  return `
    <button type="button" class="pool-banner${isLimited ? ' is-limited' : ''}" onclick="selectPool(${p.id})">
      ${visual}
      ${pickups.length ? '<span class="pool-ribbon">PICK UP</span>' : ''}
      ${poolTimeChip(p.end_at)}
      <div class="pool-bottom">
        <div style="min-width:0;flex:1">
          ${isLocked(p) ? `<div class="pool-lock">${ENTRY_LOCK_SVG}解放条件あり</div>` : ''}
          <div class="pool-name">${escHtml(p.name)}</div>
          <div class="pool-desc">${p.description ? escHtml(p.description) + ' ・ ' : ''}${t('gacha.icons_count', p.icon_count)}</div>
        </div>
        ${puStack}
      </div>
    </button>`;
}

// 帯のサムネをPUアイコンで埋める。2つ以上は少し斜めの線で分ける
function ptabSlicesHTML(icons) {
  const n = icons.length, slant = 7, gap = 1.2; // 横幅に対する%（上端と下端のずれ・すき間）
  const b = k => k / n * 100;
  return icons.map((pu, i) => {
    const tl = i === 0 ? 0 : b(i) + slant + gap, bl = i === 0 ? 0 : b(i) - slant + gap;
    const tr = i === n - 1 ? 100 : b(i + 1) + slant - gap, br = i === n - 1 ? 100 : b(i + 1) - slant - gap;
    const L = Math.min(tl, bl), R = Math.max(tr, br), W = R - L;
    const x = v => ((v - L) / W * 100).toFixed(2) + '%';
    return `<span class="gx-ptab-slice" style="left:${L}%;width:${W}%;clip-path:polygon(${x(tl)} 0,${x(tr)} 0,${x(br)} 100%,${x(bl)} 100%);background-image:url('${escHtml(thumbUrl(pu.image_url))}')"></span>`;
  }).join('');
}

function renderPoolSelector(pools) {
  if (!pools || pools.length === 0) {
    // プールなし → 直接メインUIへ（従来通り全アイコン対象）
    selectedPoolId = null;
    showGachaMain();
    return;
  }
  // 開いたら一番上のガチャを選んだ状態にして、引く画面の上の帯で切り替える
  const tabs = document.getElementById('gx-pooltabs');
  tabs.hidden = pools.length < 2;
  tabs.innerHTML = pools.map((p, i) => {
    const bg = p.image_url ? `url('${escHtml(thumbUrl(p.image_url))}')` : POOL_FALLBACK_BG[i % POOL_FALLBACK_BG.length];
    return `<button type="button" class="gx-ptab" role="tab" data-pool="${p.id}" onclick="selectPool(${p.id})">
      <span class="gx-ptab-thumb" style="background-image:${bg}">${(p.pickup_icons || []).length
        ? `<span class="gx-ptab-icons">${ptabSlicesHTML(p.pickup_icons.slice(0, 3))}${p.pickup_icons.length > 3 ? `<em>+${p.pickup_icons.length - 3}</em>` : ''}</span>`
        : !p.image_url ? `<span class="gx-ptab-mark">${uiIcon('sparkle', 22)}</span>` : ''}</span>
      <span class="gx-ptab-name">${isLocked(p) ? `<i class="gx-ptab-lock">${ENTRY_LOCK_SVG}</i>` : ''}${escHtml(p.name)}</span>
    </button>`;
  }).join('');
  selectPool(pools[0].id);
  // PC：はみ出したときはマウスのホイールでも横に動かせるように
  tabs.onwheel = e => {
    if (tabs.scrollWidth <= tabs.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    tabs.scrollLeft += e.deltaY;
  };
}

function selectPool(poolId) {
  selectedPoolId = poolId;
  const p = gPools.find(p => p.id === poolId);
  // ラベル・戻るボタン設定
  // 選んだガチャを選択画面と同じバナーで上に出す（ここではタップしても何もしない）
  document.getElementById('gx-hero').innerHTML = p ? poolBannerHTML(p, gPools.indexOf(p)) : '';
  document.getElementById('btn-back-pool').style.display = 'none';
  document.querySelectorAll('#gx-pooltabs .gx-ptab').forEach(b => {
    const on = +b.dataset.pool === poolId;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on);
    if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  // 排出率をそのガチャの確率・ピックアップに更新
  const pickupIcons = p ? (p.pickup_icons || []) : [];
  gSettings = poolSettings(p);
  if (gSettings) updateRateInfo(gSettings, pickupIcons);
  updatePullButtons();
  // GP交換（そのガチャを引いた回数・PU対応）を更新
  loadExchangeList();
  showGachaMain();
  // 排出対象モーダルキャッシュリセット
  _lastPoolModalPoolId = Symbol();
}

function showGachaMain() {
  document.getElementById('pool-select-screen').style.display = 'none';
  document.getElementById('gacha-main').style.display = '';
}

function backToPoolSelect() {
  document.getElementById('gacha-main').style.display = 'none';
  document.getElementById('pool-select-screen').style.display = '';
}

let _gpToastTimer = null;
function showGpToast(html, isError = false) {
  const el = document.getElementById('gp-toast');
  el.style.color = isError ? '#f66' : 'var(--accent, #4fc3f7)';
  el.innerHTML = html;
  el.style.display = 'block';
  el.style.opacity = '1';
  if (_gpToastTimer) clearTimeout(_gpToastTimer);
  _gpToastTimer = setTimeout(() => {
    el.style.transition = 'opacity 0.5s';
    el.style.opacity = '0';
    setTimeout(() => { el.style.display = 'none'; el.style.transition = ''; }, 500);
  }, 3000);
}

// GP交換の開閉を覚えておく
(() => {
  const el = document.getElementById('gx-exchange');
  try { if (localStorage.getItem('gxExchangeOpen') === '0') el.open = false; } catch (e) {}
  el.addEventListener('toggle', () => { try { localStorage.setItem('gxExchangeOpen', el.open ? '1' : '0'); } catch (e) {} });
})();

// GP交換：そのガチャを100回引くと解放。交換できるのはPUがあればPU、なければそのガチャのSS
const LOCK_SVG = '<svg class="gx-ex-lock" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
let exchangeState = { pulls: 0, required: 100, cost: 200 };

async function loadExchangeList() {
  const box = document.getElementById('gx-exchange');
  const container = document.getElementById('exchange-ss-list');
  try {
    const p = (gPools || []).find(x => x.id === selectedPoolId);
    const pickupIds = p && p.pickup_icons && p.pickup_icons.length ? new Set(p.pickup_icons.map(pu => pu.id)) : null;
    const iconUrl = selectedPoolId ? `/gacha/pools/${selectedPoolId}/icons` : '/gacha/icons';
    const [icons, myData, status] = await Promise.all([
      apiFetch(iconUrl), apiFetch('/gacha/my'),
      apiFetch('/gacha/exchange-status' + (selectedPoolId ? `?pool_id=${selectedPoolId}` : '')),
    ]);
    exchangeState = status;
    const open = status.pulls >= status.required;
    box.classList.toggle('open', open);
    document.getElementById('gx-ex-pulls').textContent = Math.min(status.pulls, status.required);
    document.getElementById('gx-ex-req').textContent = status.required;
    // 解放前だけ「あと◯回」を出す
    document.getElementById('gx-ex-note').textContent = open ? '' : t('gacha.exchange_locked_note', status.required);
    document.getElementById('gx-ex-seg').innerHTML = `<i style="--f:${Math.min(100, status.pulls / status.required * 100)}%"></i>`;

    const ownedIds = new Set((myData.icons || []).map(i => i.id));
    let ss = icons.filter(i => i.rarity === 'SS' && !ownedIds.has(i.id));
    if (pickupIds) ss = ss.filter(i => pickupIds.has(i.id));
    if (ss.length === 0) { container.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;grid-column:1/-1">${t('gacha.no_exchange')}</div>`; return; }
    container.innerHTML = ss.map(i => `
      <button type="button" class="gx-ex-item" onclick="askExchange(${i.id}, '${escHtml(i.name).replace(/'/g, "\\'")}', '${escHtml(thumbUrl(i.image_url)).replace(/'/g, "\\'")}')">
        <span class="gx-ex-frame"><img src="${escHtml(thumbUrl(i.image_url))}" alt="">${LOCK_SVG}</span>
        <span>${escHtml(i.name)}</span>
      </button>`).join('');
  } catch (e) {
    container.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem">${t('error')}</div>`;
  }
}

let _pendingExchange = null;

function askExchange(iconId, iconName, iconImg) {
  if (isPulling) return;
  if (exchangeState.pulls < exchangeState.required) {
    showGpToast(t('gacha.exchange_locked', exchangeState.required, exchangeState.required - exchangeState.pulls), true);
    return;
  }
  if (currentGp < exchangeState.cost) {
    showGpToast(t('gacha.gp_short', currentGp, exchangeState.cost), true);
    return;
  }
  _pendingExchange = { iconId, iconName };
  document.getElementById('exchange-modal-img').src = iconImg;
  document.getElementById('exchange-modal-name').textContent = `【SS】${iconName}`;
  const modal = document.getElementById('exchange-modal');
  if (modal.style.display !== 'flex') lockBodyScroll();
  modal.style.display = 'flex';
}

function closeExchangeModal() {
  const modal = document.getElementById('exchange-modal');
  if (modal.style.display !== 'none') unlockBodyScroll();
  modal.style.display = 'none';
  _pendingExchange = null;
}

async function confirmExchange() {
  if (!_pendingExchange) return;
  const { iconId } = _pendingExchange;
  closeExchangeModal();
  isPulling = true;
  updateGpDisplay(currentGp);
  try {
    const res = await apiFetch('/gacha/exchange', { method: 'POST', body: JSON.stringify({ icon_id: iconId, pool_id: selectedPoolId }) });
    currentGp = res.new_gp;
    updateGpDisplay(currentGp);
    const r = res.result;
    await animatePull([r], { title: 'GP交換' });
    closeGxOverlay();
    if (r.is_dup && r.dup_pts > 0) showGpToast(`<span style="color:#ffd700">【SS】${escHtml(r.name)}</span>（${t('gacha.dup_return', r.dup_pts)}）`);
    const myData = await apiFetch('/gacha/my');
    renderMyIcons(myData.icons);
    loadExchangeList();
  } catch (err) {
    showGpToast(err.message || 'エラーが発生しました', true);
  } finally {
    isPulling = false;
    updateGpDisplay(currentGp);
  }
}

function animateCount(from, to, duration) {
  return new Promise(resolve => {
    const start = performance.now();
    const diff = to - from;
    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      const ease = t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t;
      updatePointsDisplay(Math.round(from + diff * ease));
      if (t < 1) requestAnimationFrame(step);
      else { updatePointsDisplay(to); resolve(); }
    }
    requestAnimationFrame(step);
  });
}

async function showDupReturn(from, to, dupTotal) {
  const ind = document.getElementById('dup-indicator');
  ind.textContent = t('gacha.dup_return', dupTotal);
  ind.style.opacity = '1';
  await animateCount(from, to, 700);
  await new Promise(r => setTimeout(r, 1400));
  ind.style.opacity = '0';
}

function renderMyIcons(icons) {
  const el = document.getElementById('my-icons');
  if (!icons || icons.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${uiIcon('capsule')}</div><p>${t('gacha.no_icons')}</p></div>`;
    return;
  }
  const anyEquipped = icons.some(i => i.is_equipped);
  el.innerHTML = `<div class="icon-grid">${icons.map(icon => `
    <div class="icon-item">
      <span class="irarity irarity-${escHtml(icon.rarity)}">${escHtml(icon.rarity)}</span><br>
      <img src="${escHtml(thumbUrl(icon.image_url))}" alt="${escHtml(icon.name)}" loading="lazy"
           class="${icon.is_equipped ? 'equipped' : ''}"
           onclick="equipIcon(${icon.id}, this)"
           title="${escHtml(icon.name)}">
      <div class="iname">${escHtml(icon.name)}</div>
    </div>`).join('')}
    <div class="icon-item">
      <span class="irarity" style="visibility:hidden">-</span><br>
      <div class="icon-none-btn ${anyEquipped ? '' : 'equipped'}" onclick="unequipIcon(this)" title="${t('gacha.icon_none')}">✕</div>
      <div class="iname">${t('gacha.icon_none')}</div>
    </div>
  </div>`;
}

async function equipIcon(iconId, imgEl) {
  try {
    const res = await apiFetch('/gacha/equip', { method: 'POST', body: JSON.stringify({ icon_id: iconId }) });
    document.querySelectorAll('#my-icons img').forEach(el => el.classList.remove('equipped'));
    document.querySelectorAll('#my-icons .icon-none-btn').forEach(el => el.classList.remove('equipped'));
    imgEl.classList.add('equipped');
    showToast(res.message);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function unequipIcon(el) {
  try {
    const res = await apiFetch('/gacha/equip', { method: 'POST', body: JSON.stringify({ icon_id: null }) });
    document.querySelectorAll('#my-icons img').forEach(e => e.classList.remove('equipped'));
    document.querySelectorAll('#my-icons .icon-none-btn').forEach(e => e.classList.remove('equipped'));
    el.classList.add('equipped');
    showToast(res.message);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function doPull(type) {
  if (isPulling) return;
  isPulling = true;
  _getAudioCtx(); // ユーザー操作中にAudioContextをアンロック
  const btnS = document.getElementById('btn-single');
  const btnM = document.getElementById('btn-multi');
  btnS.disabled = true;
  btnM.disabled = true;
  clearAlert('#alert');

  let next = 'close';
  const overlayOpen = !!document.getElementById('gx-overlay') && !document.getElementById('gx-overlay').hidden;
  const title = (gPools.find(p => p.id === selectedPoolId) || {}).name || t('gacha.title') || '';
  try {
    // 「もう一度引く」のときは演出の画面のまま通信中を出す
    if (overlayOpen) openGxOverlay(title);
    const body = selectedPoolId ? JSON.stringify({ pool_id: selectedPoolId }) : '{}';
    const res = await apiFetch(`/gacha/pull/${type}`, { method: 'POST', body });
    // 回数制限のあるガチャは、引いた回数を数え直す（もう一度引くボタンにも効く）
    const pp = gPools.find(x => x.id === selectedPoolId);
    if (pp && pp.pull_limit != null) pp.my_pulls = (pp.my_pulls || 0) + 1;
    // コスト分を即座に減らす
    const dupTotal = res.results.reduce((s, r) => s + (r.dup_pts || 0), 0);
    const afterCost = res.new_points - dupTotal;
    animateCount(currentPoints, afterCost, 350);
    currentPoints = res.new_points;
    if (res.new_gp != null) { currentGp = res.new_gp; updateGpDisplay(currentGp); }

    next = await animatePull(res.results, { againType: type, title });

    // 重複補償を返却
    if (dupTotal > 0) await showDupReturn(afterCost, res.new_points, dupTotal);

    apiFetch('/gacha/my').then(myData => renderMyIcons(myData.icons)).catch(() => {});
    loadExchangeList();
  } catch (err) {
    next = 'close';
    closeGxOverlay();
    showToast(err.message, 'error');
  } finally {
    isPulling = false;
    refreshPullButtons();
  }
  if (next === 'again') doPull(type);
  else {
    closeGxOverlay();
    removeFinishedPool();
  }
}

// 回数制限まで引いたガチャは一覧から消して、残りのガチャに切り替える
function removeFinishedPool() {
  if (!selectedPoolId || pullsLeft() > 0) return;
  gPools = gPools.filter(x => x.id !== selectedPoolId);
  renderPoolSelector(gPools);
}

let _lastPoolModalPoolId = null;
async function openPoolModal() {
  const modal = document.getElementById('pool-modal');
  if (modal.style.display !== 'flex') lockBodyScroll();
  modal.style.display = 'flex';
  if (_lastPoolModalPoolId === selectedPoolId) return;
  _lastPoolModalPoolId = selectedPoolId;
  document.getElementById('pool-list').innerHTML = `<div class="loading"><div class="spinner"></div>${t('loading')}</div>`;
  try {
    const icons = selectedPoolId
      ? await apiFetch(`/gacha/pools/${selectedPoolId}/icons`)
      : await apiFetch('/gacha/icons');
    const order = ['SS', 'S', 'A'];
    const grouped = {};
    order.forEach(r => grouped[r] = []);
    icons.forEach(ic => { if (grouped[ic.rarity]) grouped[ic.rarity].push(ic); });
    // ピックアップを各レアリティ内の先頭へ
    order.forEach(r => grouped[r].sort((a, b) => (b.is_pickup ? 1 : 0) - (a.is_pickup ? 1 : 0)));
    const rarityColors = { SS: '#ffd700', S: '#e0c060', A: '#4fc3f7' };
    document.getElementById('pool-list').innerHTML = order.map(r => {
      if (!grouped[r].length) return '';
      const pickupCount = grouped[r].filter(ic => ic.is_pickup).length;
      return `
        <div style="margin-bottom:18px">
          <div style="font-size:0.82rem;font-weight:bold;color:${rarityColors[r]};margin-bottom:8px">${r}${getLang()==='zh'?'稀':'レア'}（${grouped[r].length}${getLang()==='zh'?'種':'種'}）${pickupCount > 0 ? `<span style="font-size:0.72rem;color:#ffd700;margin-left:8px">★PickUp ${pickupCount}${getLang()==='zh'?'枚':'枚'}</span>` : ''}</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px">
            ${grouped[r].map(ic => `
              <div style="text-align:center;position:relative">
                ${ic.is_pickup ? `<span style="position:absolute;top:0;left:50%;transform:translateX(-50%);font-size:0.6rem;font-weight:bold;color:#ffd700;background:rgba(0,0,0,0.6);border-radius:3px;padding:0 3px;white-space:nowrap;z-index:1">★PU</span>` : ''}
                <img src="${escHtml(thumbUrl(ic.image_url))}" alt="${escHtml(ic.name)}" loading="lazy"
                     style="width:54px;height:54px;border-radius:20%;object-fit:cover;border:2px solid ${ic.is_pickup ? '#ffd700' : rarityColors[r]};display:block;margin:0 auto 4px;${ic.is_pickup ? 'box-shadow:0 0 6px #ffd700aa' : ''}">
                <div style="font-size:0.62rem;color:var(--text-secondary);word-break:break-all;line-height:1.2">${escHtml(ic.name)}</div>
              </div>`).join('')}
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    document.getElementById('pool-list').innerHTML = `<div style="color:var(--danger)">${escHtml(err.message)}</div>`;
  }
}
function closePoolModal() {
  const modal = document.getElementById('pool-modal');
  if (modal.style.display !== 'none') unlockBodyScroll();
  modal.style.display = 'none';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePoolModal(); });

init();
