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
      <a class="nav-logo" href="/index.html">HBR RANKING</a>
      <div class="nav-links">
        <a href="/index.html" class="${currentPath === '/' || currentPath === '/index.html' ? 'active' : ''}">イベント一覧</a>
        ${user ? `<a href="/submit.html" class="${currentPath === '/submit.html' ? 'active' : ''}">スコア投稿</a>` : ''}
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
