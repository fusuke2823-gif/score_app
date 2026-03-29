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

function _handleAuthError(res, data) {
  if ((res.status === 401 || res.status === 403) && getToken()) {
    clearAuth();
    location.href = '/login.html?expired=1';
    return true;
  }
  return false;
}

async function apiFetch(path, options = {}) {
  const res = await fetch(API + path, {
    headers: authHeaders(),
    ...options
  });
  const data = await res.json();
  if (!res.ok) {
    if (_handleAuthError(res, data)) return;
    throw new Error(data.error || 'エラーが発生しました');
  }
  return data;
}

async function apiFormFetch(path, formData, method = 'POST') {
  const token = getToken();
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  const res = await fetch(API + path, { method, headers, body: formData });
  const data = await res.json();
  if (!res.ok) {
    if (_handleAuthError(res, data)) return;
    throw new Error(data.error || 'エラーが発生しました');
  }
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
        ${user ? `<a href="/feedback.html" class="${currentPath === '/feedback.html' ? 'active' : ''}">お便り箱</a>` : ''}
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
      ${user ? `<a href="/feedback.html">お便り箱</a>` : ''}
      ${user && user.role === 'admin' ? `<a href="/admin.html">管理</a>` : ''}
      ${user
        ? `<a href="/user.html?id=${user.id}">アカウント</a>
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
  if (!document.getElementById('interim-dist-modal')) initInterimDistributionNotice();
  updateGachaNav();
  updateFeedbackBadge();
};

async function updateFeedbackBadge() {
  const user = getUser();
  if (!user) return;
  try {
    const data = await apiFetch('/feedback/unread-reply-count');
    if (!data.count) return;
    const badge = `<span style="display:inline-block;min-width:16px;height:16px;line-height:16px;font-size:0.65rem;font-weight:bold;background:#ef5350;color:#fff;border-radius:8px;text-align:center;padding:0 4px;margin-left:4px;vertical-align:middle">${data.count}</span>`;
    document.querySelectorAll('a[href="/feedback.html"]').forEach(a => {
      a.innerHTML = 'お便り箱' + badge;
    });
  } catch {}
}

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

// ===== 配布通知（中間・最終） =====
async function initInterimDistributionNotice() {
  if (!getToken()) return;
  try {
    const [interim, final, rankPts] = await Promise.all([
      apiFetch('/events/interim-distributions/recent').catch(() => []),
      apiFetch('/events/final-distributions/recent').catch(() => []),
      apiFetch('/events/rank-pts').catch(() => null),
    ]);
    const seenAt = localStorage.getItem('interim_dist_seen_at');
    const isNew = d => !seenAt || new Date(d.distributed_at) > new Date(seenAt);
    const unseenInterim = (interim || []).filter(isNew).filter(d => d.user_rank != null).map(d => ({ ...d, type: '中間' }));
    const unseenFinal  = (final  || []).filter(isNew).filter(d => d.user_rank != null).map(d => ({ ...d, type: '最終' }));
    const unseen = [...unseenFinal, ...unseenInterim]
      .sort((a, b) => new Date(b.distributed_at) - new Date(a.distributed_at));
    if (unseen.length === 0) return;

    const style = document.createElement('style');
    style.textContent = `
      #interim-dist-modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:2100; align-items:center; justify-content:center; }
      #interim-dist-modal.open { display:flex; }
      #interim-dist-box { background:var(--bg-card); border:1px solid var(--border); border-radius:14px; padding:28px 24px; max-width:360px; width:90%; text-align:center; max-height:90vh; overflow-y:auto; }
      #interim-dist-box h3 { margin:0 0 6px; font-size:1.1rem; }
      #interim-dist-box .interim-sub { font-size:0.82rem; color:var(--text-muted); margin-bottom:18px; }
      .interim-dist-item { background:var(--bg-primary); border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:8px; text-align:left; }
      .interim-dist-name { font-size:0.88rem; font-weight:bold; margin-bottom:2px; }
      .interim-dist-rank { font-size:1.1rem; font-weight:bold; color:var(--accent); margin:4px 0 2px; }
      .interim-dist-meta { font-size:0.72rem; color:var(--text-muted); }
      .interim-type-badge { font-size:0.7rem; padding:1px 6px; border-radius:4px; margin-left:6px; background:var(--accent-dim); color:var(--accent); }
      .rank-pts-table { width:100%; border-collapse:collapse; font-size:0.78rem; margin-top:8px; }
      .rank-pts-table th, .rank-pts-table td { padding:4px 8px; border:1px solid var(--border); text-align:center; }
      .rank-pts-table th { background:var(--bg-primary); color:var(--text-muted); }
      .rank-pts-note { font-size:0.72rem; color:var(--text-muted); margin-top:6px; }
    `;
    document.head.appendChild(style);

    const modal = document.createElement('div');
    modal.id = 'interim-dist-modal';
    modal.innerHTML = `
      <div id="interim-dist-box">
        <h3>ポイント配布のお知らせ</h3>
        <div class="interim-sub">以下のイベントでポイントが配布されました</div>
        <div id="interim-dist-list">${unseen.map(d => `
          <div class="interim-dist-item">
            <div class="interim-dist-name">
              ${escHtml(d.event_name)}
              <span class="interim-type-badge">${d.type}配布</span>
            </div>
            <div class="interim-dist-rank">${d.user_rank}位　<span style="font-size:0.9rem">+${d.user_pts}pt</span></div>
            <div class="interim-dist-meta">${new Date(d.distributed_at).toLocaleString('ja-JP')}</div>
          </div>`).join('')}
        </div>
        ${rankPts ? `
        <button class="btn btn-secondary btn-sm" style="margin-top:12px;width:100%" onclick="document.getElementById('rank-pts-detail').style.display=document.getElementById('rank-pts-detail').style.display==='none'?'block':'none'">配布量詳細を見る</button>
        <div id="rank-pts-detail" style="display:none;margin-top:8px">
          <table class="rank-pts-table">
            <tr><th>順位</th><th>配布pt</th></tr>
            <tr><td>1位</td><td>${rankPts.rank_pts_1 ?? 100}pt</td></tr>
            <tr><td>2位</td><td>${rankPts.rank_pts_2 ?? 95}pt</td></tr>
            <tr><td>3位</td><td>${rankPts.rank_pts_3 ?? 95}pt</td></tr>
            <tr><td>4位</td><td>${rankPts.rank_pts_4 ?? 90}pt</td></tr>
            <tr><td>5位</td><td>${rankPts.rank_pts_5 ?? 90}pt</td></tr>
            <tr><td>6位</td><td>${rankPts.rank_pts_6 ?? 80}pt</td></tr>
            <tr><td>7位</td><td>${rankPts.rank_pts_7 ?? 80}pt</td></tr>
            <tr><td>8位</td><td>${rankPts.rank_pts_8 ?? 80}pt</td></tr>
            <tr><td>9位</td><td>${rankPts.rank_pts_9 ?? 80}pt</td></tr>
            <tr><td>10位</td><td>${rankPts.rank_pts_10 ?? 80}pt</td></tr>
            <tr><td>11〜15位</td><td>${rankPts.rank_pts_11_15 ?? 60}pt</td></tr>
            <tr><td>16〜20位</td><td>${rankPts.rank_pts_16_20 ?? 50}pt</td></tr>
            <tr><td>21〜25位</td><td>${rankPts.rank_pts_21_25 ?? 30}pt</td></tr>
            <tr><td>26〜30位</td><td>${rankPts.rank_pts_26_30 ?? 20}pt</td></tr>
            <tr><td>31位以降</td><td>${rankPts.rank_pts_31plus ?? 10}pt</td></tr>
          </table>
          <div class="rank-pts-note">※配布量はイベントごとに調整される場合があります</div>
        </div>` : ''}
        <button class="btn btn-primary" style="margin-top:12px" onclick="closeInterimDistModal()">閉じる</button>
      </div>`;
    document.body.appendChild(modal);
    modal.classList.add('open');
  } catch {}
}

function closeInterimDistModal() {
  localStorage.setItem('interim_dist_seen_at', new Date().toISOString());
  document.getElementById('interim-dist-modal')?.classList.remove('open');
  // ログインボーナスが背後で待機していれば前面に出す
  const lbModal = document.getElementById('login-bonus-modal');
  if (lbModal && lbModal.classList.contains('open')) {
    lbModal.style.zIndex = '2100';
  }
}

// ===== ログインボーナス =====
async function initLoginBonus() {
  if (!getToken()) return;

  const style = document.createElement('style');
  style.textContent = `
    #login-bonus-modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:2000; align-items:center; justify-content:center; }
    #login-bonus-modal.open { display:flex; }
    #login-bonus-box { background:var(--bg-card); border:1px solid var(--border); border-radius:14px; padding:28px 24px; max-width:360px; width:90%; text-align:center; max-height:90vh; overflow-y:auto; }
    #login-bonus-box h3 { margin:0 0 6px; font-size:1.1rem; }
    #login-bonus-box .bonus-sub { font-size:0.82rem; color:var(--text-muted); margin-bottom:18px; }
    .bonus-days { display:flex; gap:6px; justify-content:center; margin-bottom:20px; flex-wrap:wrap; }
    .bonus-day { width:38px; height:48px; border-radius:8px; border:1px solid var(--border); background:var(--bg-primary); display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:0.7rem; color:var(--text-muted); gap:2px; }
    .bonus-day.done { background:var(--accent-dim); border-color:var(--accent); color:var(--accent); }
    .bonus-day.today { border-color:var(--accent); background:var(--accent); color:#fff; font-weight:bold; }
    .bonus-day .day-pt { font-size:0.78rem; font-weight:bold; }
    #login-bonus-pts { font-size:2rem; font-weight:bold; color:var(--accent); margin-bottom:6px; }
    #login-bonus-msg { font-size:0.85rem; color:var(--text-muted); margin-bottom:18px; }
    .special-bonus-list { margin-top:18px; border-top:1px solid var(--border); padding-top:14px; text-align:left; }
    .special-bonus-list h4 { font-size:0.85rem; color:var(--text-muted); margin:0 0 10px; text-align:center; }
    .special-bonus-item { background:var(--bg-primary); border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:8px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .special-bonus-info { flex:1; min-width:0; }
    .special-bonus-title { font-size:0.88rem; font-weight:bold; margin-bottom:2px; }
    .special-bonus-meta { font-size:0.72rem; color:var(--text-muted); }
    .special-bonus-btn { flex-shrink:0; }
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
      <div id="special-bonus-section"></div>
    </div>`;
  document.body.appendChild(modal);

  try {
    const [status, specials] = await Promise.all([
      apiFetch('/auth/login-bonus'),
      apiFetch('/auth/special-bonuses').catch(() => [])
    ]);

    const hasUnclaimed = specials.some(b => b.claimed_count < b.max_claims && b.last_claimed_date !== new Date().toISOString().slice(0, 10));

    if (status.already_claimed && !hasUnclaimed) return;

    if (!status.already_claimed) {
      renderBonusDays(status.streak + 1, status.day_pts || [1,1,1,1,1,1,4]);
    } else {
      document.getElementById('bonus-claim-btn').style.display = 'none';
      document.getElementById('login-bonus-pts').textContent = '本日分受取済み';
    }

    if (specials.length > 0) renderSpecialBonuses(specials);
    document.getElementById('login-bonus-modal').classList.add('open');
  } catch {}
}

function renderBonusDays(todayDay, pts) {
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

function renderSpecialBonuses(bonuses) {
  const today = new Date().toISOString().slice(0, 10);
  const el = document.getElementById('special-bonus-section');
  const items = bonuses.filter(b => b.max_claims - b.claimed_count > 0).map(b => {
    const remaining = b.max_claims - b.claimed_count;
    const claimedToday = b.last_claimed_date && b.last_claimed_date.slice(0, 10) === today;
    const canClaim = remaining > 0 && !claimedToday;
    return `<div class="special-bonus-item">
      <div class="special-bonus-info">
        <div class="special-bonus-title">${escHtml(b.title)}</div>
        <div class="special-bonus-meta">${escHtml(b.end_date.slice(0,10))}まで ・ ${b.points_per_claim}pt ・ 残り${remaining}回</div>
      </div>
      <button class="btn btn-primary btn-sm special-bonus-btn" ${canClaim ? '' : 'disabled'}
        onclick="claimSpecialBonus(${b.id}, this)">
        ${claimedToday ? '受取済' : remaining <= 0 ? '上限達成' : '受け取る'}
      </button>
    </div>`;
  }).join('');
  el.innerHTML = `<div class="special-bonus-list"><h4>特別ボーナス</h4>${items}</div>`;
}

function checkAndCloseModal() {
  const loginBtn = document.getElementById('bonus-claim-btn');
  const loginDone = !loginBtn || loginBtn.style.display === 'none' || loginBtn.disabled || loginBtn.textContent === '閉じる' || loginBtn.textContent === '受取済み';
  const anySpecialLeft = [...document.querySelectorAll('.special-bonus-btn')].some(b => !b.disabled);
  if (loginDone && !anySpecialLeft) {
    setTimeout(() => document.getElementById('login-bonus-modal')?.classList.remove('open'), 800);
  }
}

async function claimSpecialBonus(bonusId, btn) {
  btn.disabled = true;
  try {
    const res = await apiFetch(`/auth/special-bonuses/${bonusId}/claim`, { method: 'POST' });
    btn.textContent = '受取済';
    const meta = btn.closest('.special-bonus-item').querySelector('.special-bonus-meta');
    const remaining = res.max_claims - res.claimed_count;
    if (meta) meta.textContent = meta.textContent.replace(/残り\d+回/, `残り${remaining}回`);
    checkAndCloseModal();
  } catch (err) {
    btn.disabled = false;
    alert(err.message);
  }
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
    checkAndCloseModal();
  } catch (err) {
    btn.disabled = false;
  }
}
