const API = '/api';

const ATTRIBUTES = ['火', '氷', '雷', '光', '闇', '無'];

function getToken() { return localStorage.getItem('token'); }
function getUser() {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
}
function setAuth(token, user) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}
function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

function authHeaders() {
  const t = getToken();
  return t ? { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function apiFetch(path, options = {}) {
  const res = await fetch(API + path, {
    headers: authHeaders(),
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'エラーが発生しました');
  return data;
}

async function apiFormFetch(path, formData, method = 'POST') {
  const token = getToken();
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  const res = await fetch(API + path, { method, headers, body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'エラーが発生しました');
  return data;
}

function formatScore(n) {
  if (n == null) return '-';
  return Number(n).toLocaleString('ja-JP');
}

function formatDate(s) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
}

function showAlert(container, message, type = 'error') {
  const el = document.querySelector(container);
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type}">${escHtml(message)}</div>`;
}

function clearAlert(container) {
  const el = document.querySelector(container);
  if (el) el.innerHTML = '';
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attrBadge(attr, small = false) {
  return `<span class="attr-badge attr-${escHtml(attr)}${small ? ' small' : ''}">${escHtml(attr)}</span>`;
}

function statusBadge(status) {
  const labels = { pending: '承認待ち', approved: '承認済み', rejected: '却下' };
  return `<span class="status-badge status-${status}">${labels[status] || status}</span>`;
}

// ナビゲーション描画
function renderNav() {
  const user = getUser();
  const nav = document.getElementById('nav');
  if (!nav) return;
  const currentPath = location.pathname;

  nav.innerHTML = `
    <div class="nav-inner">
      <a class="nav-logo" href="/index.html">HBR-RB</a>
      <div class="nav-links">
        <a href="/index.html" class="${currentPath === '/' || currentPath === '/index.html' ? 'active' : ''}">イベント一覧</a>
        ${user ? `<a href="/submit.html" class="${currentPath === '/submit.html' ? 'active' : ''}">スコア投稿</a>` : ''}
        <a href="/shop.html" class="${currentPath === '/shop.html' && !location.search.includes('tab=equip') ? 'active' : ''}">ショップ</a>
        ${user ? `<a href="/shop.html?tab=equip" class="${currentPath === '/shop.html' && location.search.includes('tab=equip') ? 'active' : ''}">装備</a>` : ''}
        <span id="nav-gacha-desktop" style="display:contents"></span>
        ${user && user.role === 'admin' ? `<a href="/admin.html" class="${currentPath === '/admin.html' ? 'active' : ''}">管理</a>` : ''}
      </div>
      <div class="nav-user">
        ${user
          ? `<a href="/user.html?id=${user.id}" class="nav-username">${escHtml(user.username)}</a>
             ${user.role === 'admin' ? '<span class="nav-admin-badge">管理者</span>' : ''}
             <button class="btn btn-secondary btn-sm" onclick="logout()">ログアウト</button>`
          : `<a href="/login.html" class="btn btn-secondary btn-sm">ログイン</a>
             <a href="/register.html" class="btn btn-primary btn-sm">登録</a>`
        }
      </div>
      <button class="nav-hamburger" id="nav-hamburger" onclick="toggleMobileNav()" aria-label="メニュー">
        <span></span><span></span><span></span>
      </button>
    </div>
    <div class="nav-mobile" id="nav-mobile">
      <a href="/index.html">イベント一覧</a>
      ${user ? `<a href="/submit.html">スコア投稿</a>` : ''}
      <a href="/shop.html">ショップ</a>
      ${user ? `<a href="/shop.html?tab=equip">装備</a>` : ''}
      <span id="nav-gacha-mobile" style="display:contents"></span>
      ${user && user.role === 'admin' ? `<a href="/admin.html">管理</a>` : ''}
      ${user
        ? `<a href="/user.html?id=${user.id}">${escHtml(user.username)}</a>
           <a href="#" onclick="logout();return false;">ログアウト</a>`
        : `<a href="/login.html">ログイン</a>
           <a href="/register.html">新規登録</a>`
      }
    </div>`;
}

function toggleMobileNav() {
  document.getElementById('nav-mobile')?.classList.toggle('open');
}

// renderNav後に自動でログインボーナスチェック＋ガチャナビ更新
const _origRenderNav = renderNav;
renderNav = function() {
  _origRenderNav();
  if (!document.getElementById('login-bonus-modal')) initLoginBonus();
  updateGachaNav();
};

async function updateGachaNav() {
  try {
    // キャッシュチェック（5分）
    const cached = localStorage.getItem('gacha_show_nav');
    const cachedAt = parseInt(localStorage.getItem('gacha_nav_cached_at') || '0');
    let show = false;
    if (cached !== null && Date.now() - cachedAt < 5 * 60 * 1000) {
      show = cached === 'true';
    } else {
      const s = await apiFetch('/gacha/settings');
      show = s.show_nav;
      localStorage.setItem('gacha_show_nav', show ? 'true' : 'false');
      localStorage.setItem('gacha_nav_cached_at', Date.now());
    }
    const user = getUser();
    if (!show && !(user && user.role === 'admin')) return;
    const currentPath = location.pathname;
    const isActive = currentPath === '/gacha.html';
    const linkHtml = `<a href="/gacha.html"${isActive ? ' class="active"' : ''}>ガチャ</a>`;
    const d = document.getElementById('nav-gacha-desktop');
    const m = document.getElementById('nav-gacha-mobile');
    if (d) d.innerHTML = linkHtml;
    if (m) m.innerHTML = linkHtml;
  } catch {}
}

function logout() {
  clearAuth();
  location.href = '/index.html';
}

function requireLogin() {
  if (!getToken()) {
    location.href = '/login.html';
    return false;
  }
  return true;
}

function requireAdmin() {
  const user = getUser();
  if (!user || user.role !== 'admin') {
    location.href = '/index.html';
    return false;
  }
  return true;
}

function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

// ===== ログインボーナス =====
async function initLoginBonus() {
  if (!getToken()) return;

  const style = document.createElement('style');
  style.textContent = `
    #login-bonus-modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:2000; align-items:center; justify-content:center; }
    #login-bonus-modal.open { display:flex; }
    #login-bonus-box { background:var(--bg-card); border:1px solid var(--border); border-radius:14px; padding:28px 24px; max-width:340px; width:90%; text-align:center; }
    #login-bonus-box h3 { margin:0 0 6px; font-size:1.1rem; }
    #login-bonus-box .bonus-sub { font-size:0.82rem; color:var(--text-muted); margin-bottom:18px; }
    .bonus-days { display:flex; gap:6px; justify-content:center; margin-bottom:20px; flex-wrap:wrap; }
    .bonus-day { width:38px; height:48px; border-radius:8px; border:1px solid var(--border); background:var(--bg-primary); display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:0.7rem; color:var(--text-muted); gap:2px; }
    .bonus-day.done { background:var(--accent-dim); border-color:var(--accent); color:var(--accent); }
    .bonus-day.today { border-color:var(--accent); background:var(--accent); color:#fff; font-weight:bold; }
    .bonus-day .day-pt { font-size:0.78rem; font-weight:bold; }
    #login-bonus-pts { font-size:2rem; font-weight:bold; color:var(--accent); margin-bottom:6px; }
    #login-bonus-msg { font-size:0.85rem; color:var(--text-muted); margin-bottom:18px; }
  `;
  document.head.appendChild(style);

  const modal = document.createElement('div');
  modal.id = 'login-bonus-modal';
  modal.innerHTML = `
    <div id="login-bonus-box">
      <h3>ログインボーナス</h3>
      <div class="bonus-sub">毎日ログインでポイント獲得！</div>
      <div class="bonus-days" id="bonus-days"></div>
      <div id="login-bonus-pts"></div>
      <div id="login-bonus-msg"></div>
      <button class="btn btn-primary" id="bonus-claim-btn" onclick="claimLoginBonus()">受け取る</button>
    </div>`;
  document.body.appendChild(modal);

  try {
    const status = await apiFetch('/auth/login-bonus');
    if (status.already_claimed) return;
    renderBonusDays(status.streak + 1);
    document.getElementById('login-bonus-modal').classList.add('open');
  } catch {}
}

function renderBonusDays(todayDay) {
  const pts = [1,1,1,1,1,1,4];
  const daysEl = document.getElementById('bonus-days');
  daysEl.innerHTML = pts.map((p, i) => {
    const day = i + 1;
    const done = day < todayDay;
    const isToday = day === todayDay;
    return `<div class="bonus-day ${done ? 'done' : isToday ? 'today' : ''}">
      <span>${day}日目</span>
      <span class="day-pt">${p}pt</span>
    </div>`;
  }).join('');
  const todayPt = pts[Math.min(todayDay, 7) - 1];
  document.getElementById('login-bonus-pts').textContent = `+${todayPt}pt`;
  document.getElementById('login-bonus-msg').textContent = `${todayDay}日目のボーナス`;
}

async function claimLoginBonus() {
  const btn = document.getElementById('bonus-claim-btn');
  btn.disabled = true;
  try {
    const res = await apiFetch('/auth/login-bonus', { method: 'POST' });
    document.getElementById('login-bonus-pts').textContent = `+${res.points_earned}pt 獲得！`;
    document.getElementById('login-bonus-msg').textContent = `${res.streak}日目 達成！${res.streak === 7 ? ' 🎉 7日達成！' : ''}`;
    btn.textContent = '閉じる';
    btn.onclick = () => document.getElementById('login-bonus-modal').classList.remove('open');
    btn.disabled = false;
  } catch (err) {
    btn.disabled = false;
  }
}
