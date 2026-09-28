// 特殊ガチャのギミック定義。敵の作成時に1つ選び、HPなどの数値はここで固定する。
// 数値は通常の敵と討伐までの平均回数（約22回の10連）が揃うようにシミュレーションで調整している。
const GIMMICKS = {
  normal: {
    label: '通常',
    description: '',
    max_hp: 28000,
  },
  shield: {
    label: 'シールド',
    description: 'シールドがある間はダメージが防がれ、破壊率も上がらない。敵の回復はシールドの回復になり、割った後も復活する',
    max_hp: 8000,
    shield: 100,
    // シールドがある間、破壊率アイテムの枠がこれに置き換わる
    shieldBreak: [
      { key: 'shield_break_small', p: 0.50, amount: 5, label: 'シールド削り(小)' },
      { key: 'shield_break_medium', p: 0.35, amount: 10, label: 'シールド削り(中)' },
      { key: 'shield_break_large', p: 0.15, amount: 20, label: 'シールド削り(大)' },
    ],
    // 敵の回復アイテムがシールドの回復に置き換わる（上限は初期シールド）
    shieldRegen: {
      heal_small: { key: 'shield_regen_small', amount: 5, label: 'シールド回復(小)' },
      heal_large: { key: 'shield_regen_large', amount: 10, label: 'シールド回復(大)' },
    },
  },
};

function getGimmick(key) {
  return GIMMICKS[key] || GIMMICKS.normal;
}

// 画面・管理画面に渡す公開情報
function gimmickSummary(key) {
  const g = getGimmick(key);
  return { key: GIMMICKS[key] ? key : 'normal', label: g.label, description: g.description, max_hp: g.max_hp, max_shield: g.shield || 0 };
}

module.exports = { GIMMICKS, getGimmick, gimmickSummary };
