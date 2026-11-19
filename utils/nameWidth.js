// 表示名の長さは見た目の幅で数える（全角1文字=2、半角の英数字・記号・半角カナ=1）。
// 上限は全角11文字の幅 = 22。public/js/common.js の nameWidth と同じ数え方。
const NAME_MAX_WIDTH = 22;

function nameWidth(s) {
  let w = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    w += (c <= 0x7e || (c >= 0xff61 && c <= 0xff9f)) ? 1 : 2;
  }
  return w;
}

const NAME_LENGTH_ERROR = 'ユーザー名は全角11文字（半角22文字）までで入力してください';

module.exports = { NAME_MAX_WIDTH, nameWidth, NAME_LENGTH_ERROR };
