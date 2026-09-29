// 討伐ガチャのギミック定義。敵の作成時に1つ選び、HPなどの数値はここで固定する。
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
  overdrive: {
    label: '破壊率上限超上昇',
    description: '破壊率の上限が9999%に上がり、破壊率アイテムが出やすく上昇量も3倍。クリティカルは出にくいが900ダメージ',
    max_hp: 150000, // 破壊率が数千%まで伸びるので大幅に高くして、通常と平均回数を揃えている
    destructionMax: 9999.0,
    destructionMult: 3,
    // 敵の回復も最大HPに対する割合を通常（300/800 ÷ 28000）と揃える
    healAmount: { heal_small: 1600, heal_large: 4300 },
    // 破壊率アイテムを20%にし、残り80%を他カテゴリに元の比率(7:1:1)で配分
    categoryP: { damage: 0.70 * 0.8 / 0.9, favorable: 0.10 * 0.8 / 0.9, unfavorable: 0.10 * 0.8 / 0.9, destruction: 0.20 },
    // クリティカルを1%にし、余った4%を小・中・大ダメージに元の比率で配分
    damage: {
      miss: { p: 0.30 * 0.99 / 0.95 },
      normal: { p: 0.45 * 0.99 / 0.95 },
      crit: { p: 0.20 * 0.99 / 0.95 },
      ultra: { p: 0.01, dmg: 900 },
    },
  },
  gauge: {
    label: 'ゲージアクション',
    description: 'ゲージ攻撃のカードを引くと、10連の最後にゲージアクションが発動。往復するマーカーを中心の近くで止めるほど大ダメージ（最大3倍）',
    max_hp: 33500, // 平均的な腕前（PERFECT15%/GREAT30%/GOOD35%/MISS20%）で通常と平均回数が揃う値
    gauge: {
      p: 0.10,    // ダメージカードのうちゲージ攻撃に置き換わる割合（全体では 70%×10% = 7%）
      base: 40,   // 基本ダメージ（攻撃UP・破壊率などの倍率は引いた時点の値を掛ける）
      // 精度 = 1 - |マーカー位置|（中心=1、端=0）。上から順に判定
      tiers: [
        { name: 'PERFECT', min: 0.9, mult: 3 },
        { name: 'GREAT', min: 0.7, mult: 2 },
        { name: 'GOOD', min: 0.4, mult: 1.5 },
        { name: 'MISS', min: 0, mult: 1 },
      ],
      autoAccuracy: 0.45, // タップしなかったときはGOOD扱い
    },
  },
};

function getGimmick(key) {
  return GIMMICKS[key] || GIMMICKS.normal;
}

// 画面・管理画面に渡す公開情報
function gimmickSummary(key) {
  const g = getGimmick(key);
  return {
    key: GIMMICKS[key] ? key : 'normal', label: g.label, description: g.description, max_hp: g.max_hp,
    max_shield: g.shield || 0, max_destruction: g.destructionMax || 999.0,
    // ゲージの判定幅は画面の描画にも使う（判定そのものはサーバーで行う）
    gauge: g.gauge ? { tiers: g.gauge.tiers, auto_accuracy: g.gauge.autoAccuracy } : null,
  };
}

module.exports = { GIMMICKS, getGimmick, gimmickSummary };
