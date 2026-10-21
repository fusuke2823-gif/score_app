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
  const label = _gachaMuted ? '効果音を鳴らす' : '効果音を消す';
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
