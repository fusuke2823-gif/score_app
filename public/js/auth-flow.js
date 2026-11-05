// ログインと新規登録で共通の流れ：Google か ID で入り、新しい人はプロフィールの設定へ進んで元のページに戻る
(() => {
  const params = new URLSearchParams(location.search);
  const $ = id => document.getElementById(id);
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const DOT = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="4"/></svg>';
  const EYE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c7 0 11 7 11 7a18 18 0 0 1-3.3 4M6.5 6.6A18 18 0 0 0 1 12s4 7 11 7a10.6 10.6 0 0 0 5-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  // 戻り先はこのサイトの中だけ（外部のURLや javascript: には移らない）
  function backTo() {
    const r = params.get('redirect');
    if (!r || !r.startsWith('/') || r.startsWith('//') || r.includes('\\')) return '/index.html';
    return r;
  }
  const qs = () => { const q = new URLSearchParams(); ['redirect', 'ref'].forEach(k => { if (params.get(k)) q.set(k, params.get(k)); }); const s = q.toString(); return s ? `?${s}` : ''; };
  const msgOf = err => (err instanceof TypeError ? t('auth.network') : err.message);

  function setBusy(btn, busy, label) {
    btn.disabled = busy;
    btn.innerHTML = busy ? `<span class="auth-spin" aria-hidden="true"></span>${escHtml(label)}` : escHtml(label);
  }
  function fieldError(input, msg) {
    input.classList.toggle('is-invalid', !!msg);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    const box = input.closest('.form-group');
    box.querySelector('.auth-err')?.remove();
    if (!msg) return;
    box.insertAdjacentHTML('beforeend', `<p class="auth-err" role="alert">${escHtml(msg)}</p>`);
  }
  function setRule(el, state) { // state: '' | 'ok' | 'ng'
    el.className = `auth-rule${state ? ` ${state}` : ''}`;
    el.querySelector('svg').outerHTML = state === 'ok' ? CHECK : DOT;
  }
  function bindPwToggles() {
    document.querySelectorAll('.pw-toggle').forEach(b => {
      const show = v => { b.innerHTML = v ? EYE_OFF : EYE; b.setAttribute('aria-label', t(v ? 'auth.pw_hide' : 'auth.pw_show')); b.setAttribute('aria-pressed', v); };
      show(false);
      b.addEventListener('click', () => {
        const input = b.closest('.pw-wrap').querySelector('input');
        const toText = input.type === 'password';
        input.type = toText ? 'text' : 'password';
        show(toText);
      });
    });
  }
  // キーボードで最初の欄へ。スマホは画面が隠れるので開かない
  function focusIfDesktop(el) { if (el && matchMedia('(hover:hover) and (pointer:fine)').matches) el.focus(); }

  // ===== Google =====
  const isInAppBrowser = () => /Line\/|FBAN|FBAV|Instagram|MicroMessenger|WebView|wv\b|Twitter|TwitterAndroid/i.test(navigator.userAgent);
  async function copyText(text, btn) {
    try { await navigator.clipboard.writeText(text); btn.textContent = t('auth.copied'); }
    catch { showToast(t('error'), 'error'); }
  }
  function initGoogle(mode) {
    fetch('/api/auth/google/client-id').then(r => r.json()).then(({ client_id }) => {
      if (!client_id) return;
      const box = $('auth-google'), wrap = $('google-btn-wrap');
      box.hidden = false;
      if (isInAppBrowser()) {
        wrap.className = '';
        wrap.innerHTML = `<div class="auth-inapp">${escHtml(t('auth.inapp'))}<br><button type="button" class="btn btn-secondary btn-sm" id="auth-copy-url">${escHtml(t('auth.copy_url'))}</button></div>`;
        $('auth-copy-url').onclick = e => copyText(location.href, e.currentTarget);
        $('auth-google-note')?.remove();
        return;
      }
      const render = () => {
        if (!window.google) return;
        google.accounts.id.initialize({ client_id, callback: onGoogle });
        google.accounts.id.renderButton(wrap, { theme: 'outline', size: 'large', width: Math.min(wrap.clientWidth || 320, 400), text: mode === 'login' ? 'signin_with' : 'signup_with', locale: getLang() === 'zh' ? 'zh_TW' : 'ja' });
      };
      if (window.google) render();
      else document.querySelector('script[src*="accounts.google.com"]')?.addEventListener('load', render);
    }).catch(() => {});
  }
  async function onGoogle(response) {
    clearAlert('#alert');
    try {
      const data = await apiFetch('/auth/google/verify', { method: 'POST', body: JSON.stringify({ credential: response.credential }) });
      if (data.token) { setAuth(data.token, data.user); location.href = backTo(); }
      else if (data.needs_username) openSetup({ googleToken: data.google_token });
    } catch (err) { showAlert('#alert', msgOf(err)); }
  }

  // ===== プロフィールの設定（登録の2段階目） =====
  const stepsHtml = () => `
    <ol class="auth-steps">
      <li class="done"><i>${CHECK}</i>${escHtml(t('auth.step_account'))}</li>
      <li class="now" aria-current="step"><i>2</i>${escHtml(t('auth.step_profile'))}</li>
    </ol>`;
  // X・YouTube はURLや @ つきで貼られても受ける
  const handleOf = v => v.trim().replace(/^https?:\/\/(www\.|m\.)?(x\.com|twitter\.com|youtube\.com)\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
  function openSetup({ googleToken = null, loginId = null }) {
    $('auth-entry').hidden = true;
    const box = $('auth-setup');
    box.hidden = false;
    box.innerHTML = `
      ${stepsHtml()}
      <h2 class="auth-setup-title">${escHtml(t('register.setup_title'))}</h2>
      <p class="auth-setup-desc">${escHtml(t('auth.setup_desc'))}</p>
      ${loginId ? `<div class="auth-idbox">
        <div class="auth-idbox-row"><span>${escHtml(t('register.login_id'))}　<b>${escHtml(loginId)}</b></span><button type="button" class="btn btn-secondary btn-sm" id="auth-copy-id">${escHtml(t('auth.copy'))}</button></div>
        ${escHtml(t('auth.keep_id'))}
      </div>` : ''}
      <div id="setup-alert" aria-live="polite"></div>
      <form id="setup-form" novalidate>
        <div class="form-group">
          <label class="form-label" for="setup-name">${escHtml(t('auth.display_name'))}<small id="setup-name-count">0/12</small></label>
          <input class="form-input" id="setup-name" type="text" maxlength="12" required autocomplete="nickname">
        </div>
        <div class="form-group">
          <label class="form-label" for="setup-oshi">${escHtml(t('auth.oshi'))}<small>${escHtml(t('auth.optional'))}</small></label>
          <select class="form-input" id="setup-oshi"><option value="">${escHtml(t('auth.not_set'))}</option></select>
        </div>
        <details class="auth-sns">
          <summary>${escHtml(t('auth.sns_title'))}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>
          <div class="auth-sns-body">
            <p class="auth-sns-note">${escHtml(t('auth.sns_note'))}</p>
            <div class="form-group">
              <label class="form-label" for="setup-x">X (Twitter) ID</label>
              <div class="auth-handle"><span aria-hidden="true">@</span><input class="form-input" id="setup-x" type="text" maxlength="60" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
            </div>
            <div class="form-group">
              <label class="form-label" for="setup-yt">${escHtml(t('auth.yt_handle'))}</label>
              <div class="auth-handle"><span aria-hidden="true">@</span><input class="form-input" id="setup-yt" type="text" maxlength="80" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
            </div>
          </div>
        </details>
        <button type="submit" class="btn btn-primary btn-wide auth-submit" id="setup-submit">${escHtml(t('auth.start'))}</button>
      </form>`;
    box.closest('.auth-card').scrollIntoView({ block: 'start' });
    fetch('/api/charts/game-data').then(r => r.json()).then(({ characters }) => {
      $('setup-oshi').insertAdjacentHTML('beforeend', characters.map(c => `<option value="${escHtml(c.name)}">${escHtml(c.name)}</option>`).join(''));
    }).catch(() => {});
    if (loginId) $('auth-copy-id').onclick = e => copyText(loginId, e.currentTarget);
    const name = $('setup-name');
    name.addEventListener('input', () => {
      $('setup-name-count').textContent = `${name.value.length}/12`;
      fieldError(name, '');
    });
    focusIfDesktop(name);
    $('setup-form').addEventListener('submit', async e => {
      e.preventDefault();
      clearAlert('#setup-alert');
      const username = name.value.trim();
      if (!username) { fieldError(name, t('auth.name_required')); name.focus(); return; }
      const xInput = $('setup-x'), ytInput = $('setup-yt');
      const twitter = handleOf(xInput.value), youtube = handleOf(ytInput.value);
      fieldError(xInput, twitter && !/^[A-Za-z0-9_]{1,15}$/.test(twitter) ? t('auth.x_invalid') : '');
      fieldError(ytInput, youtube && !/^[A-Za-z0-9._-]{3,30}$/.test(youtube) ? t('auth.yt_invalid') : '');
      if (xInput.classList.contains('is-invalid') || ytInput.classList.contains('is-invalid')) {
        document.querySelector('.auth-sns').open = true;
        (xInput.classList.contains('is-invalid') ? xInput : ytInput).focus();
        return;
      }
      const oshi = $('setup-oshi').value;
      const btn = $('setup-submit');
      setBusy(btn, true, t('auth.saving'));
      try {
        const data = googleToken
          ? await apiFetch('/auth/google/register', { method: 'POST', body: JSON.stringify({ google_token: googleToken, username, ref: params.get('ref') || undefined, oshi_character: oshi || undefined, twitter_username: twitter || undefined, youtube_channel: youtube || undefined }) })
          : await apiFetch('/auth/me', { method: 'PUT', body: JSON.stringify({ username, oshi_character: oshi || null, twitter_username: twitter || null, youtube_channel: youtube || null }) });
        setAuth(data.token, data.user);
        // いま聞いたばかりなので、X・YouTube の登録のお願いをすぐには重ねない
        try { localStorage.setItem('account_prompt_seen', new Date().toISOString()); } catch {}
        location.href = backTo();
      } catch (err) {
        setBusy(btn, false, t('auth.start'));
        if (/ユーザー名/.test(err.message)) { fieldError(name, err.message); name.focus(); }
        else showAlert('#setup-alert', msgOf(err));
      }
    });
  }

  // ===== ログイン =====
  function initLogin() {
    if (params.get('expired')) showAlert('#alert', t('login.expired'), 'info');
    const user = $('username'), pw = $('password');
    // パスワードを忘れた人の連絡先（管理画面で設定。空なら案内を出さない）
    fetch('/api/auth/support-contact').then(r => r.json()).then(({ x_username }) => {
      if (!x_username) return;
      const link = $('auth-forgot-link');
      link.href = `https://x.com/${encodeURIComponent(x_username)}`;
      link.textContent = `@${x_username}`;
      $('auth-forgot').hidden = false;
    }).catch(() => {});
    focusIfDesktop(user);
    [user, pw].forEach(i => i.addEventListener('input', () => fieldError(i, '')));
    $('login-form').addEventListener('submit', async e => {
      e.preventDefault();
      clearAlert('#alert');
      fieldError(user, user.value.trim() ? '' : t('auth.id_required'));
      fieldError(pw, pw.value ? '' : t('auth.pw_required'));
      if (!user.value.trim()) { user.focus(); return; }
      if (!pw.value) { pw.focus(); return; }
      const btn = $('submit-btn');
      setBusy(btn, true, t('login.btn_loading'));
      try {
        const data = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ username: user.value.trim(), password: pw.value }) });
        setAuth(data.token, data.user);
        location.href = backTo();
      } catch (err) {
        showAlert('#alert', msgOf(err));
        setBusy(btn, false, t('login.btn'));
        pw.select();
      }
    });
  }

  // ===== 新規登録 =====
  function initRegister() {
    if (params.get('ref')) $('internal-badge').hidden = false;
    const code = $('user-code'), pw = $('password');
    const codeOk = () => /^[A-Za-z0-9_]{4,20}$/.test(code.value);
    const pwOk = () => pw.value.length >= 6;
    focusIfDesktop(code);
    code.addEventListener('input', () => { fieldError(code, ''); setRule($('rule-id'), codeOk() ? 'ok' : ''); });
    pw.addEventListener('input', () => { setRule($('rule-pw'), pwOk() ? 'ok' : ''); });
    code.addEventListener('blur', () => { if (code.value && !codeOk()) setRule($('rule-id'), 'ng'); });
    pw.addEventListener('blur', () => { if (pw.value && !pwOk()) setRule($('rule-pw'), 'ng'); });
    $('register-form').addEventListener('submit', async e => {
      e.preventDefault();
      clearAlert('#alert');
      if (!codeOk()) { setRule($('rule-id'), 'ng'); code.classList.add('is-invalid'); code.focus(); return; }
      if (!pwOk()) { setRule($('rule-pw'), 'ng'); pw.focus(); return; }
      code.classList.remove('is-invalid');
      const btn = $('submit-btn');
      setBusy(btn, true, t('register.btn_loading'));
      try {
        const data = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ user_code: code.value, password: pw.value, ref: params.get('ref') || undefined }) });
        setAuth(data.token, data.user);
        openSetup({ loginId: data.user.user_code });
      } catch (err) {
        setBusy(btn, false, t('auth.next'));
        if (/このID/.test(err.message)) { fieldError(code, t('auth.id_taken')); code.focus(); }
        else showAlert('#alert', msgOf(err));
      }
    });
  }

  window.initAuthPage = mode => {
    bindPwToggles();
    document.querySelectorAll('.auth-switch a').forEach(a => { a.href = a.getAttribute('href') + qs(); });
    initGoogle(mode);
    if (mode === 'login') initLogin(); else initRegister();
  };
  window.authBackTo = backTo;
})();
