// ガチャの効果音（Web Audio）とミュートの切り替え
let _audioCtx = null;
const _audioBuffers = {};

function _getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

async function _sePreload(src) {
  if (_audioBuffers[src]) return;
  try {
    const buf = await fetch(src).then(r => r.arrayBuffer());
    const ctx = _getAudioCtx();
    _audioBuffers[src] = await ctx.decodeAudioData(buf);
  } catch (e) {}
}

// 効果音のオン/オフ（通常・討伐ガチャ共通、端末に保存）
const GACHA_MUTE_KEY = 'hbr_gacha_muted';
let _gachaMuted = false;
try { _gachaMuted = localStorage.getItem(GACHA_MUTE_KEY) === '1'; } catch (_) {}
function renderGachaMute() {
  const btn = document.getElementById('gacha-mute');
  btn.classList.toggle('is-muted', _gachaMuted);
  const label = _gachaMuted ? t('gacha.unmute') : t('gacha.mute');
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4z" fill="currentColor" fill-opacity="0.25"/>${_gachaMuted
    ? '<path d="M16 9l5 6M21 9l-5 6"/>'
    : '<path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'}</svg>`;
}
function toggleGachaMute() {
  _gachaMuted = !_gachaMuted;
  try { localStorage.setItem(GACHA_MUTE_KEY, _gachaMuted ? '1' : '0'); } catch (_) {}
  renderGachaMute();
}
renderGachaMute();

function _sePlay(src) {
  if (_gachaMuted) return null;
  const ctx = _getAudioCtx();
  const buf = _audioBuffers[src];
  if (!buf) return null;
  const src_ = ctx.createBufferSource();
  src_.buffer = buf;
  src_.connect(ctx.destination);
  src_.start(0);
  return src_;
}

function _seStop(node) {
  if (!node) return;
  try { node.stop(); } catch (e) {}
}

// ===== ルーレットの音（音のファイルを使わず、その場で作る） =====
// 転がる音（雑音を帯域で絞った連続音）・仕切りに当たる音・収まる音・結果の音。ミュート中は鳴らさない
const sgRlSound = (() => {
  let noiseBuf = null;
  const noise = ctx => {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  };
  const on = () => !_gachaMuted;
  // 玉が転がる音。speed（0〜1）で高さと大きさが変わる
  function roll() {
    if (!on()) return { speed() {}, stop() {} };
    const ctx = _getAudioCtx();
    const src = ctx.createBufferSource(); src.buffer = noise(ctx); src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    const g = ctx.createGain(); g.gain.value = 0;
    // 細かいゴロゴロ感：音量を速く揺らす
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    lfo.frequency.value = 28; lfoG.gain.value = 0.02;
    lfo.connect(lfoG).connect(g.gain);
    src.connect(bp).connect(lp).connect(g).connect(ctx.destination);
    src.start(); lfo.start();
    return {
      speed(v) {
        const t = ctx.currentTime;
        bp.frequency.setTargetAtTime(260 + 900 * v, t, 0.05);
        lfo.frequency.setTargetAtTime(10 + 30 * v, t, 0.05);
        g.gain.setTargetAtTime(0.025 + 0.06 * v, t, 0.05);
      },
      stop() {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, 0.04);
        setTimeout(() => { try { src.stop(); lfo.stop(); } catch (_) {} }, 300);
      },
    };
  }
  // 仕切りに当たる「カチッ」（強さ 0〜1）
  function click(v = 0.5) {
    if (!on()) return;
    const ctx = _getAudioCtx(), t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noise(ctx);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600 + Math.random() * 900; bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 + 0.25 * v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t, Math.random()); src.stop(t + 0.05);
  }
  // ポケットに落ちた瞬間：仕切りに当たる「カチッ」を強めに2回（別の音は足さない）
  function land() {
    click(1);
    setTimeout(() => click(0.7), 45);
  }
  // 結果の音（効果音の素材）。ルーレットの敵を開いたときに読み込んでおく
  const RESULT = { win: '/sounds/roulette_win.mp3', zero: '/sounds/roulette_jackpot.mp3', lose: '/sounds/roulette_lose.mp3' };
  const preload = () => Object.values(RESULT).forEach(_sePreload);
  // 大当たりの音は長いので、2秒で止める（最後の0.2秒で小さくしていく）
  const CUT = { zero: 2 };
  function result(kind) {
    const src = RESULT[kind];
    if (!src || !on() || !_audioBuffers[src]) return;
    const ctx = _getAudioCtx(), t = ctx.currentTime;
    const node = ctx.createBufferSource(), g = ctx.createGain();
    node.buffer = _audioBuffers[src];
    node.connect(g).connect(ctx.destination);
    const cut = CUT[kind];
    if (cut) {
      g.gain.setValueAtTime(1, t + cut - 0.2);
      g.gain.linearRampToValueAtTime(0, t + cut);
      node.start(t); node.stop(t + cut);
    } else node.start(t);
  }
  return { roll, click, land, result, preload };
})();
