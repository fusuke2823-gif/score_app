// ===== 全画面の演出（通常ガチャ・GP交換） =====
const _gxWait = ms => new Promise(r => setTimeout(r, ms));

function _gxOverlay() {
  let ov = document.getElementById('gx-overlay');
  if (ov) return ov;
  ov = document.createElement('div');
  ov.id = 'gx-overlay';
  ov.className = 'gx-overlay';
  ov.hidden = true;
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.innerHTML = `
    <div class="gx-aurora"></div>
    <div class="gx-stars"></div>
    <div class="gx-screen-flash" id="gx-screen-flash"></div>
    <div class="gx-top"><span class="gx-title" id="gx-title"></span><button type="button" class="gx-skip" id="gx-skip" hidden>SKIP ›</button></div>
    <div class="gx-stage" id="gx-stage"></div>
    <div class="gx-bottom">
      <div class="gx-actions" id="gx-actions" hidden></div>
    </div>
    <div class="gx-closeup" id="gx-closeup" hidden></div>`;
  document.body.appendChild(ov);
  return ov;
}

// 演出の画面を開く（開いていれば中身だけ入れ替える）。引く通信中はくるくるを出す
function openGxOverlay(title) {
  const ov = _gxOverlay();
  document.getElementById('gx-title').textContent = title || '';
  document.getElementById('gx-stage').innerHTML = '<div class="gx-loading"><div class="spinner"></div></div>';
  document.getElementById('gx-actions').hidden = true;
  document.getElementById('gx-actions').classList.remove('show');
  document.getElementById('gx-skip').hidden = true;
  document.body.classList.remove('gx-result');
  ov.className = 'gx-overlay';
  if (ov.hidden) {
    ov.hidden = false;
    lockBodyScroll();
    document.body.classList.add('gx-open');
    requestAnimationFrame(() => ov.classList.add('open'));
  } else {
    ov.classList.add('open');
  }
  return ov;
}

function closeGxOverlay() {
  const ov = document.getElementById('gx-overlay');
  if (!ov || ov.hidden) return;
  ov.classList.remove('open');
  setTimeout(() => { ov.hidden = true; document.getElementById('gx-stage').innerHTML = ''; }, 250);
  document.body.classList.remove('gx-open', 'gx-result');
  unlockBodyScroll();
}

// 1枚ずつ中央に大きく出してめくる演出。
//  SS：虹のカード（昇格するときは低い色のカード → 昇格）→ カードを消して名前 → カードを戻す → 溜め → めくる（長め）
//  S・A：カード → 短い溜め → めくる（名前の前置きなし）
// 演出の途中でタップすると、その1枚はめくれた状態まで飛ばす。めくれたあとはタップか一定時間で次へ
let _gxActiveReveal = null;
const GX_REVEAL = {
  A:  { charge: 350, hold: 1100, sound: null },
  S:  { charge: 650, hold: 1500, sound: '/sounds/s_sound.mp3' },
  SS: { charge: 900, hold: 3500, sound: '/sounds/ss_sound.mp3' },
};
async function _gxReveal(icon, shownRarity, { onUpgrade = null, onRevealed = null } = {}) {
  const r = icon.rarity;
  const cfg = GX_REVEAL[r] || GX_REVEAL.A;
  // 低く見せているカードは、大きく出してからその上で本来のレアリティに上がる
  const fakeout = shownRarity !== r;
  const cu = document.getElementById('gx-closeup');
  cu.className = 'gx-closeup';
  cu.dataset.r = shownRarity;
  cu.innerHTML = `
    <div class="gx-up-ring"></div>
    <div class="gx-up-flash"></div>
    <div class="gx-streak"></div>
    ${r === 'SS' ? `<div class="gx-cu-intro">${escHtml(icon.name)}</div>` : ''}
    <div class="gx-big" data-r="${shownRarity}">
      <div class="gx-big-inner">
        <div class="gx-big-face gx-big-front"><img src="/img/logo.png" alt=""></div>
        <div class="gx-big-face gx-big-back">
          <img src="${escHtml(thumbUrl(icon.image_url))}" alt="${escHtml(icon.name)}">
          <span class="gx-big-rank">${escHtml(r)}</span>
          <div class="gx-big-name">${escHtml(icon.name)}</div>
        </div>
      </div>
      ${icon.is_dup ? '' : '<span class="gx-big-new">NEW</span>'}
    </div>
    <div class="gx-cu-hint">タップで次へ</div>
    <div class="gx-flash"></div>`;
  cu.hidden = false;
  const big = cu.querySelector('.gx-big');
  const intro = cu.querySelector('.gx-cu-intro');

  // タップ1回目：めくれた状態まで飛ばす / 2回目（めくれたあと）：次へ
  // 音は見えている色のものを鳴らす（昇格する前に本来の音が鳴るとばれるため）
  const shownSound = (GX_REVEAL[shownRarity] || GX_REVEAL.A).sound;
  let audio = shownSound ? _sePlay(shownSound) : null;
  let jumped = false, revealed = false, finished = false, finishResolve;
  const finishedP = new Promise(res => { finishResolve = res; });
  let wakeUp = null;
  const wait = ms => new Promise(res => { const t = setTimeout(res, ms); wakeUp = () => { clearTimeout(t); res(); }; });
  const onTap = () => {
    if (revealed) { finish(); return; }
    jumped = true;
    if (wakeUp) wakeUp();
  };
  function finish() {
    if (finished) return;
    finished = true;
    cu.removeEventListener('click', onTap);
    cu.classList.remove('show');
    setTimeout(() => { cu.hidden = true; cu.innerHTML = ''; finishResolve(); }, 200);
  }
  cu.addEventListener('click', onTap);
  // SKIPボタンから今の1枚を閉じられるようにしておく
  _gxActiveReveal = { rarity: r, close: () => { jumped = true; if (wakeUp) wakeUp(); _seStop(audio); finish(); } };
  finishedP.then(() => { _gxActiveReveal = null; });
  requestAnimationFrame(() => cu.classList.add('show'));

  if (!jumped) await wait(120);
  cu.classList.add('card-in');
  if (!jumped) await wait(r === 'SS' && !fakeout ? 650 : fakeout ? 600 : 300);
  // 昇格：大きいカードが震えて白く光り、弾けて本来のレアリティの色に変わる
  if (fakeout) {
    if (!jumped) {
      const ms = r === 'SS' ? 1000 : 750;
      big.style.setProperty('--uc', `${ms}ms`);
      big.classList.add('up-charge');
      await wait(ms);
    }
    big.classList.remove('up-charge');
    _seStop(audio);
    audio = cfg.sound ? _sePlay(cfg.sound) : null;
    big.dataset.r = r;
    cu.dataset.r = r;
    if (onUpgrade) onUpgrade();
    cu.classList.add('upgraded');
    big.classList.add('up-pop');
    if (!jumped) await wait(r === 'SS' ? 1100 : 800);
    big.classList.remove('up-pop');
  }
  big.dataset.r = r;
  // SS：虹のカードが出たあと、カードを消して背景の上に名前を出し、カードを戻してからめくる
  if (intro) {
    const ov = document.getElementById('gx-overlay');
    if (!jumped) {
      cu.classList.add('dim');
      ov.classList.add('cu-name');
      await wait(350);
    }
    if (!jumped) {
      intro.classList.add('in');
      await wait(1400);
    }
    intro.classList.add('out');
    cu.classList.remove('dim');
    ov.classList.remove('cu-name');
    if (!jumped) await wait(400);
  }
  if (!jumped) {
    big.classList.add('charging');
    await wait(cfg.charge);
  }
  // 画像の読み込みが終わってからめくる（遅れて出るのを防ぐ。最長1.5秒待つ）
  const bigImg = cu.querySelector('.gx-big-back img');
  if (bigImg && !bigImg.complete) await Promise.race([bigImg.decode().catch(() => {}), _gxWait(1500)]);
  _seStop(audio);
  big.classList.remove('charging');
  if (jumped) big.classList.add('instant');
  _sePlay('/sounds/turn.mp3');
  big.classList.add('flipped');
  cu.classList.add('burst');
  if (!jumped) await wait(350);
  cu.classList.add('revealed');
  revealed = true;
  if (onRevealed) onRevealed();
  setTimeout(finish, cfg.hold);
  return finishedP;
}

// 最初の演出の光の色の段階。最後の色（見た目の一番高いレアリティ）より低い色から始めて、途中で格上げすることがある
function _gxTintSteps(finalTint) {
  const r = Math.random();
  if (finalTint === 'SS') {
    if (r < 0.10) return ['A', 'S', 'SS'];
    if (r < 0.45) return ['S', 'SS'];
    return ['SS'];
  }
  if (finalTint === 'S') return r < 0.25 ? ['A', 'S'] : ['S'];
  return ['A'];
}

// ===== 最初の演出 =====
// どれも同じ形の関数：{ ov, stage, wrap, cardEls, tint, steps, waitOrSkip, fast, waitTap } を受け取り、
// 主役（山札など）を出して waitTap() でタップを待ち、そのあと光の色を steps の順に上げながら盛り上げて、
// 最後に cardEls を並べ終える（card-visible を付ける）。画面のタップで飛ばせるのは waitTap() のあとから
const GX_INTROS = {};

// 確定演出（SSが出るときだけ呼ぶ。あとで追加する）。どちらも ctx = { ov, stage, anchor, results } を受け取る
//  wait：タップ待ちの画面に出す（タップされるまで出しっぱなしにする要素を ctx.stage に足す。戻り値は無視）
//  tap ：タップした直後に流す（終わるまで待つ async 関数）
const GX_CONFIRM_FX = { wait: null, tap: null };

// 光の色（オーバーレイ全体と、演出の主役の要素）を変える
function _gxSetTint(ov, el, t) {
  ov.classList.remove('tint-A', 'tint-S', 'tint-SS');
  ov.classList.add(`tint-${t}`);
  if (el) el.dataset.t = t;
}
// 画面全体の白いフラッシュ（虹になった瞬間など）
function _gxScreenFlash() {
  const fl = document.getElementById('gx-screen-flash');
  fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
}
// クラスを付け直してCSSのアニメーションを最初から流す
function _gxRestart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

// カードを from(k)（画面上の四角。山札の一番上の札など）の位置・大きさから自分の場所へ、弧を描いて飛ばして並べる
async function _gxDealFrom(cardEls, from, { fast, onEach } = {}) {
  for (let k = 0; k < cardEls.length; k++) {
    if (fast && fast()) break;
    const card = cardEls[k];
    // 先に dealt（変形なし）にしてから、並ぶ場所の本来の大きさを測る
    card.classList.add('dealt', 'in-flight');
    const r = card.getBoundingClientRect();
    const f = from(k);
    const dx = (f.left + f.width / 2) - (r.left + r.width / 2), dy = (f.top + f.height / 2) - (r.top + r.height / 2);
    const sc = (f.width / r.width).toFixed(3);
    const rot = (Math.random() * 24 - 12).toFixed(1);
    _sePlay('/sounds/putcard.mp3');
    // 飛んでいる間は山札の札と同じ見た目にし、着地したところで色（見せかけのレアリティ）を付ける
    setTimeout(() => card.classList.remove('in-flight'), 340);
    // 札と同じ位置・大きさから持ち上げて、弧を描いて飛ぶ
    card.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${sc})` },
      { transform: `translate(${dx}px, ${dy - 14}px) scale(${sc * 1.04})`, offset: 0.12 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(1.1) rotate(${rot}deg)`, offset: 0.55 },
      { transform: 'none' },
    ], { duration: 480, easing: 'cubic-bezier(.3,.7,.35,1)' });
    if (onEach) onEach(k);
    await _gxWait(95);
  }
  cardEls.forEach(c => c.classList.add('card-visible'));
  if (fast && fast()) cardEls.forEach(c => c.classList.remove('in-flight'));
  // 飛び終わったら、めくるときの拡大などの移り変わりを戻す
  setTimeout(() => cardEls.forEach(c => c.classList.remove('dealt')), 500);
}

// 山札：上から落ちてくる → タップ待ち → 左右に割ってリフルシャッフル → 扇に広げる（ここで光の色が上がることがある） → 閉じる → 光を溜めて沈む → 弧を描いて配る
GX_INTROS.deck = async ({ ov, stage, wrap, cardEls, tint, steps, waitOrSkip, fast, waitTap }) => {
  const deck = document.createElement('div');
  deck.className = 'gx-deck';
  // 札は12枚。偶数番は左・奇数番は右の山に割り、下から交互に落として噛み合わせる。扇は真ん中から外へ光が伝わる
  const DECK_N = 12;
  const sparkColors = ['#ffd700', '#ff66cc', '#00eeff', '#7cff8a', '#b07cff'];
  deck.innerHTML = '<div class="gx-deck-bloom"></div><div class="gx-deck-aura"></div>' +
    `<div class="gx-deck-sparks">${Array.from({ length: 14 }, (_, k) => `<i style="--x:${(k * 37) % 100}%;--d:${(k * 113) % 1600}ms;--c:${sparkColors[k % sparkColors.length]}"></i>`).join('')}</div>` +
    Array.from({ length: DECK_N }, (_, k) => {
      const side = k % 2 ? 1 : -1;
      const c = k - (DECK_N - 1) / 2;
      const fa = c * 9;                       // 扇：-49.5〜49.5度
      return `<div class="gx-deck-card" style="--k:${k};--hx:${side * 62}%;--hr:${side * 9}deg;--md:${k * 34}ms;--fa:${fa}deg;--fd:${k * 18}ms;--wd:${Math.round(Math.abs(c) * 45)}ms"><img src="/img/logo.png" alt=""></div>`;
    }).join('');
  stage.appendChild(deck);
  const bloom = () => _gxRestart(deck, 'bloom');
  const setTint = t => _gxSetTint(ov, deck, t);

  // 1. 上から回りながら落ちてきて、着地で小さな揺れ
  setTint(steps[0]);
  requestAnimationFrame(() => deck.classList.add('in'));
  await waitOrSkip(480);
  if (!fast()) { _sePlay('/sounds/putcard.mp3'); _gxRestart(stage, 'gx-quake'); }
  if (steps[0] === 'SS' && !fast()) {
    await waitOrSkip(200);
    _gxScreenFlash();
    const a = _sePlay('/sounds/ss_sound.mp3'); setTimeout(() => _seStop(a), 700);
    await waitOrSkip(450);
  }

  // 2. タップを待つ（山札の下に「タップ」が点滅）
  await waitTap(deck);
  await waitOrSkip(150);

  // 3. リフルシャッフル：左右の山に割り、下から交互に落として1つに噛み合わせる
  if (!fast()) {
    deck.classList.add('split');
    await waitOrSkip(320);
    _sePlay('/sounds/turn.mp3');
    deck.classList.add('merge');
    deck.classList.remove('split');
    await waitOrSkip(DECK_N * 34 + 200);
    deck.classList.remove('merge');
    _sePlay('/sounds/putcard.mp3');
    await waitOrSkip(160);
  }

  // 4. 扇に広げる。格上げがある場合は、広げたままカードが浮いて震え、真ん中から外へ光が伝わって色が上がる
  if (!fast()) {
    deck.classList.add('fan');
    _sePlay('/sounds/turn.mp3');
    await waitOrSkip(520);
    for (const up of steps.slice(1)) {
      if (fast()) break;
      deck.classList.add('lift', 'shake');
      await waitOrSkip(480);
      deck.classList.remove('shake');
      const upAudio = _sePlay(up === 'SS' ? '/sounds/ss_sound.mp3' : '/sounds/s_sound.mp3');
      setTimeout(() => _seStop(upAudio), 700);
      setTint(up);
      if (up === 'SS') _gxScreenFlash();
      _gxRestart(deck, 'wave');
      bloom();
      await waitOrSkip(300);
      deck.classList.remove('lift');
      await waitOrSkip(400);
    }
    await waitOrSkip(180);
  }
  setTint(tint);

  // 5. 閉じる
  deck.classList.remove('fan', 'wave');
  if (!fast()) await waitOrSkip(300);

  // 6. 光を溜めながら、並ぶ場所の下へ沈む
  const wrapRect = wrap.getBoundingClientRect();
  const d0 = deck.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const targetCy = Math.min(wrapRect.bottom + d0.height * 0.5 + 28, stageRect.bottom - d0.height * 0.5 - 8);
  const dy = Math.max(0, targetCy - (d0.top + d0.height / 2));
  deck.style.setProperty('--deck-y', `${dy}px`);
  if (!fast()) {
    deck.classList.add('charge');
    await waitOrSkip(tint === 'SS' ? 600 : 380);
  }
  deck.classList.add('lowered');
  if (!fast()) await waitOrSkip(380);
  deck.classList.remove('charge');

  // 7. 山札の一番上の札を持ち上げて、弧を描いて配る（持ち上げた札は山札から消える）
  deck.classList.add('dealing');
  const deckCards = [...deck.querySelectorAll('.gx-deck-card')].reverse(); // 上の札から順に
  await _gxDealFrom(cardEls, k => deckCards[Math.min(k, deckCards.length - 1)].getBoundingClientRect(), {
    fast,
    onEach: k => { if (deckCards[k]) deckCards[k].classList.add('used'); },
  });
  deck.classList.add('out');
  setTimeout(() => deck.remove(), 400);
};

// カードを配ってめくる演出。最後に結果とボタンを出し、押されたボタン（'again' / 'close'）を返す。
// againType: 「もう一度引く」の種類（'single' / 'multi'）。null ならボタンを出さない（GP交換など）
async function animatePull(results, { againType = null, title = '' } = {}) {
  const ov = openGxOverlay(title);
  // 演出で使う画像を先に読み込んでおく（小さいカードと大きいカードで同じURL）
  results.forEach(icon => { const im = new Image(); im.src = thumbUrl(icon.image_url); });
  const stage = document.getElementById('gx-stage');
  stage.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'gacha-cards';
  stage.appendChild(wrap);

  // めくる前のカードに見せるレアリティ（たまに低く見せてから化けさせる）
  const dispRarities = results.map(icon => {
    if (icon.rarity === 'SS') {
      const r = Math.random();
      if (r < 0.70) return 'SS';
      if (r < 0.90) return 'S';
      return 'A';
    }
    if (icon.rarity === 'S') return Math.random() < 0.75 ? 'S' : 'A';
    return 'A';
  });
  // 10連の10枚目はS以上確定なので、見た目も必ず金以上にする
  if (results.length === 10 && dispRarities[9] === 'A') dispRarities[9] = 'S';
  const tint = dispRarities.includes('SS') ? 'SS' : dispRarities.includes('S') ? 'S' : 'A';

  const cardEls = results.map((icon, i) => {
    const card = document.createElement('div');
    card.className = `g-card rarity-${icon.rarity} display-rarity-${dispRarities[i]}`;
    card.innerHTML = `
      <div class="g-card-inner" id="gc-${i}">
        <div class="g-card-front"><img src="/img/logo.png" alt="" style="width:70%;height:70%;object-fit:contain;opacity:0.7"></div>
        <div class="g-card-back">
          <span class="g-shine"></span>
          <img src="${escHtml(thumbUrl(icon.image_url))}" alt="${escHtml(icon.name)}" title="${escHtml(icon.name)}">
          <span class="g-rank g-rank-${escHtml(icon.rarity)}">${escHtml(icon.rarity)}</span>
          ${icon.is_dup ? '' : '<span class="g-new">NEW</span>'}
        </div>
      </div>`;
    wrap.appendChild(card);
    return card;
  });

  // SKIP：今の1枚を閉じ、残りのA・Sは小さいカードのまま一気にめくる。SSは最後まで見せる
  let skip = false;
  const skipBtn = document.getElementById('gx-skip');
  skipBtn.hidden = false;
  skipBtn.onclick = e => {
    e.stopPropagation();
    skip = true; skipBtn.hidden = true; cardEls.forEach(c => c.classList.add('card-visible'));
    if (_gxActiveReveal && _gxActiveReveal.rarity !== 'SS') _gxActiveReveal.close();
  };
  // 最初の演出（シャッフル・配る）の間は、画面のタップでその演出だけ飛ばす（めくる演出はそのまま）。
  // 受け付けるのはタップ待ち（waitTap）のあとから
  let introSkip = false;
  const onIntroTap = () => { introSkip = true; };
  const hasSS = results.some(r => r.rarity === 'SS');
  // タップ待ち：anchor（山札など）の下に「タップ」を点滅させ、画面のどこかがタップされるかSKIPされるまで待つ
  const waitTap = async anchor => {
    if (skip) return;
    const ctx = { ov, stage, anchor, results };
    const hint = document.createElement('div');
    hint.className = 'gx-tap-hint';
    hint.textContent = 'タップ';
    const ar = anchor.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    hint.style.top = `${ar.bottom - sr.top + 26}px`;
    stage.appendChild(hint);
    if (hasSS && GX_CONFIRM_FX.wait) { try { GX_CONFIRM_FX.wait(ctx); } catch (_) {} }
    await new Promise(res => {
      const done = () => { clearInterval(iv); ov.removeEventListener('click', done); res(); };
      const iv = setInterval(() => { if (skip) done(); }, 40);
      ov.addEventListener('click', done);
    });
    hint.remove();
    if (hasSS && GX_CONFIRM_FX.tap && !skip) { try { await GX_CONFIRM_FX.tap(ctx); } catch (_) {} }
    ov.addEventListener('click', onIntroTap);
  };

  // ===== 最初の演出 → 配る =====
  // SKIPされたら途中でも抜ける待ち時間
  const waitOrSkip = async ms => { const end = Date.now() + ms; while (!skip && !introSkip && Date.now() < end) await _gxWait(40); };
  const fast = () => skip || introSkip;
  const intro = GX_INTROS.deck; // SS用の別の演出はここで選ぶ（tint・steps を見て）
  await intro({ ov, stage, wrap, cardEls, tint, steps: _gxTintSteps(tint), waitOrSkip, fast, waitTap });
  ov.removeEventListener('click', onIntroTap);
  await _gxWait(fast() ? 450 : 600);

  // めくる
  for (let i = 0; i < results.length; i++) {
    const icon = results[i];
    const actual = icon.rarity;
    const isFakeout = dispRarities[i] !== actual;
    const card = cardEls[i];
    if (i > 0 && skip && actual !== 'SS') await _gxWait(30);

    // SKIP後はSS以外を小さいカードのまま一気にめくる（光の輪だけ）
    if (skip && actual !== 'SS') {
      if (isFakeout) {
        card.classList.remove(`display-rarity-${dispRarities[i]}`);
        card.classList.add(`display-rarity-${actual}`);
      }
      _sePlay('/sounds/turn.mp3');
      document.getElementById(`gc-${i}`).classList.add('flipped');
      setTimeout(() => card.classList.add('pop'), 280);
      continue;
    }
    // 1枚ずつ中央に大きく出してめくる。低く見せていたカードは、大きく出してから昇格する
    card.classList.add('gx-current');
    await _gxWait(220);
    card.classList.remove('gx-current');
    const upgradeSmall = () => {
      card.classList.remove(`display-rarity-${dispRarities[i]}`);
      card.classList.add(`display-rarity-${actual}`);
    };
    // 小さいカードは、大きいカードがめくれて中身が見えてから表にする（先に表にするとネタバレになる）
    const flipSmall = () => document.getElementById(`gc-${i}`).classList.add('flipped');
    await _gxReveal(icon, skip ? actual : dispRarities[i], { onUpgrade: upgradeSmall, onRevealed: flipSmall });
    if (isFakeout) upgradeSmall();
    flipSmall();
    card.classList.add('pop');
  }
  skipBtn.hidden = true;
  await _gxWait(skip ? 500 : 700);

  // 結果のボタン
  const actions = document.getElementById('gx-actions');
  const cost = againType === 'single' ? gSettings?.single_cost : againType === 'multi' ? gSettings?.multi_cost : null;
  const canAgain = againType && cost != null && currentPoints >= cost;
  const againImg = againType === 'single' ? '/img/gacha_1.png' : '/img/gacha_10.png';
  actions.innerHTML = `
    <button type="button" class="gx-close" data-act="close" aria-label="閉じる">
      <span class="gx-close-ring"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></span>
      閉じる
    </button>
    ${againType ? `<button type="button" class="gx-again" data-act="again"${canAgain ? '' : ' disabled title="ポイントが足りません"'} aria-label="もう一度引く（${againType === 'single' ? '単発' : '10連'} ${cost}pt）">
      <span class="gx-again-tag">${canAgain ? 'もう一度' : 'ポイント不足'}</span>
      <img src="${againImg}" alt="">
    </button>` : ''}`;
  actions.hidden = false;
  document.body.classList.add('gx-result');
  requestAnimationFrame(() => actions.classList.add('show'));

  return new Promise(resolve => {
    const onKey = e => { if (e.key === 'Escape') done('close'); };
    function done(act) {
      document.removeEventListener('keydown', onKey);
      actions.querySelectorAll('button').forEach(b => { b.onclick = null; });
      resolve(act);
    }
    actions.querySelectorAll('button[data-act]').forEach(b => { b.onclick = () => done(b.dataset.act); });
    document.addEventListener('keydown', onKey);
  });
}
