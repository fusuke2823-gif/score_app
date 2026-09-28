const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getGimmick, gimmickSummary } = require('../utils/specialGachaGimmicks');

// 管理者限定リリース中。一般公開する際はこの1行を削除する。
router.use(authenticateToken, requireAdmin);

const PULL_COST = 100;
const PULLS_PER_TRY = 10;
const DUR_SMALL = 15, DUR_LARGE = 8;
const DESTRUCTION_MAX = 999.0;
const DESTRUCTION_INC = { destruction_25: 25.0, destruction_50: 50.0, destruction_100: 100.0 };
const HEAL_AMOUNT = { heal_small: 300, heal_large: 800 };

const CAT = [
  { name: 'damage', p: 0.70, label: 'ダメージリソース' },
  { name: 'favorable', p: 0.10, label: '有利アイテム' },
  { name: 'unfavorable', p: 0.10, label: '不利アイテム' },
  { name: 'destruction', p: 0.10, label: '破壊率アイテム' },
];
const DAMAGE_BASE_TABLE = [
  { name: 'miss', p: 0.30, dmg: 10, label: '小ダメージ' },
  { name: 'normal', p: 0.45, dmg: 20, label: '中ダメージ' },
  { name: 'crit', p: 0.20, dmg: 40, label: '大ダメージ' },
  { name: 'ultra', p: 0.05, dmg: 90, label: 'クリティカルダメージ' },
];
const FAVORABLE = [
  { key: 'ally_small', p: 0.30, label: '攻撃UP(小)', sub: '与ダメ+50%・15連' },
  { key: 'ally_large', p: 0.10, label: '攻撃UP(大)', sub: '与ダメ+200%・8連' },
  { key: 'debuff_small', p: 0.30, label: '防御DOWN(小)', sub: '与ダメ+50%・15連' },
  { key: 'debuff_large', p: 0.10, label: '防御DOWN(大)', sub: '与ダメ+200%・8連' },
  { key: 'critup_small', p: 0.15, label: 'CRT率UP(小)', sub: '高ダメ確率1.5倍・15連' },
  { key: 'critup_large', p: 0.05, label: 'CRT率UP(大)', sub: '高ダメ確率2倍・8連' },
];
const UNFAVORABLE = [
  { key: 'enemybuff_small', p: 0.35, label: '防御UP(小)', sub: '与ダメ-20%・15連' },
  { key: 'enemybuff_large', p: 0.15, label: '防御UP(大)', sub: '与ダメ-50%・8連' },
  { key: 'heal_small', p: 0.35, label: '敵の回復(小)' },
  { key: 'heal_large', p: 0.15, label: '敵の回復(大)' },
];
const DESTRUCTION = [
  { key: 'destruction_25', p: 0.50, label: '破壊率上昇+25%', sub: `破壊率+${DESTRUCTION_INC.destruction_25.toFixed(1)}%` },
  { key: 'destruction_50', p: 0.35, label: '破壊率上昇+50%', sub: `破壊率+${DESTRUCTION_INC.destruction_50.toFixed(1)}%` },
  { key: 'destruction_100', p: 0.15, label: '破壊率上昇+100%', sub: `破壊率+${DESTRUCTION_INC.destruction_100.toFixed(1)}%` },
];
const LARGE_KEYS = new Set(['ally_large', 'debuff_large', 'critup_large', 'enemybuff_large']);
const COUNTER_KEYS = ['ally_small', 'ally_large', 'debuff_small', 'debuff_large', 'enemybuff_small', 'enemybuff_large', 'critup_small', 'critup_large'];

// ギミックごとの確率表。ギミックで指定がない項目は通常と同じ値を使う
function tablesFor(gimmick) {
  const cat = gimmick.categoryP ? CAT.map(c => ({ ...c, p: gimmick.categoryP[c.name] })) : CAT;
  const damage = gimmick.damage ? DAMAGE_BASE_TABLE.map(t => ({ ...t, ...gimmick.damage[t.name] })) : DAMAGE_BASE_TABLE;
  const mult = gimmick.destructionMult || 1;
  const destruction = DESTRUCTION.map(t => {
    const amount = DESTRUCTION_INC[t.key] * mult;
    return { ...t, amount, label: `破壊率上昇+${amount}%`, sub: `破壊率+${amount.toFixed(1)}%` };
  });
  const heal = { ...HEAL_AMOUNT, ...gimmick.healAmount };
  const unfavorable = UNFAVORABLE.map(t => (heal[t.key] ? { ...t, sub: `敵HP+${heal[t.key]}` } : t));
  return { cat, damage, destruction, heal, unfavorable, destructionMax: gimmick.destructionMax || DESTRUCTION_MAX };
}

function pick(list) {
  const r = Math.random();
  let acc = 0;
  for (const item of list) {
    acc += item.p;
    if (r < acc) return item;
  }
  return list[list.length - 1];
}

// 1連分の抽選とダメージ計算。state (COUNTER_KEYS・destruction_rate・shield を持つオブジェクト) を直接更新する。
function rollOne(state, gimmick, tables = tablesFor(gimmick)) {
  const cat = pick(tables.cat);

  if (cat.name === 'damage') {
    const [missBase, normalBase, critBase, ultraBase] = tables.damage.map(t => t.p);
    const critBoost = 1 + (state.critup_small > 0 ? 0.5 : 0) + (state.critup_large > 0 ? 1.0 : 0);
    const crit = critBase * critBoost, ultra = ultraBase * critBoost;
    const added = (crit - critBase) + (ultra - ultraBase);
    const missShare = missBase / (missBase + normalBase), normalShare = normalBase / (missBase + normalBase);
    const miss = Math.max(0, missBase - added * missShare), normal = Math.max(0, normalBase - added * normalShare);
    const table = [
      { ...tables.damage[0], p: miss },
      { ...tables.damage[1], p: normal },
      { ...tables.damage[2], p: crit },
      { ...tables.damage[3], p: ultra },
    ];
    const roll = pick(table);
    const allyBonus = (state.ally_small > 0 ? 0.5 : 0) + (state.ally_large > 0 ? 2.0 : 0);
    const debuffBonus = (state.debuff_small > 0 ? 0.5 : 0) + (state.debuff_large > 0 ? 2.0 : 0);
    const enemyPenalty = (state.enemybuff_small > 0 ? 0.2 : 0) + (state.enemybuff_large > 0 ? 0.5 : 0);
    const mult = (1 + allyBonus) * (1 + debuffBonus) * Math.max(0, 1 - enemyPenalty) * (state.destruction_rate / 100);
    const dmg = Math.round(roll.dmg * mult);
    decrementAll(state);
    // シールド中はダメージの代わりにシールドを1削る（防がれたダメージ量は演出用に返す）
    if (state.shield > 0) {
      state.shield--;
      return { category: 'damage', key: roll.name, label: roll.label, dmg: 0, blocked: true, blocked_dmg: dmg };
    }
    return { category: 'damage', key: roll.name, label: roll.label, dmg };
  }

  if (cat.name === 'favorable') {
    const roll = pick(FAVORABLE);
    state[roll.key] = LARGE_KEYS.has(roll.key) ? DUR_LARGE : DUR_SMALL;
    decrementAll(state);
    return { category: 'favorable', key: roll.key, label: roll.label, sub: roll.sub, dmg: 0 };
  }

  if (cat.name === 'destruction') {
    // シールド中は破壊率が上がらず、枠がシールド削りに置き換わる
    if (gimmick.shieldBreak && state.shield > 0) {
      const roll = pick(gimmick.shieldBreak);
      state.shield = Math.max(0, state.shield - roll.amount);
      decrementAll(state);
      return { category: 'shield', key: roll.key, label: roll.label, sub: `シールド-${roll.amount}`, amount: roll.amount, dmg: 0 };
    }
    const roll = pick(tables.destruction);
    state.destruction_rate = Math.min(tables.destructionMax, state.destruction_rate + roll.amount);
    decrementAll(state);
    return { category: 'destruction', key: roll.key, label: roll.label, sub: roll.sub, amount: roll.amount, dmg: 0 };
  }

  const roll = pick(tables.unfavorable);
  const regen = gimmick.shieldRegen && gimmick.shieldRegen[roll.key];
  if (regen) {
    state.shield = Math.min(gimmick.shield, state.shield + regen.amount);
    decrementAll(state);
    return { category: 'unfavorable', key: regen.key, label: regen.label, sub: `シールド+${regen.amount}`, amount: regen.amount, dmg: 0 };
  }
  let dmg = 0;
  if (tables.heal[roll.key]) dmg = -tables.heal[roll.key];
  else state[roll.key] = LARGE_KEYS.has(roll.key) ? DUR_LARGE : DUR_SMALL;
  decrementAll(state);
  return { category: 'unfavorable', key: roll.key, label: roll.label, sub: roll.sub, dmg };
}

function decrementAll(state) {
  for (const k of COUNTER_KEYS) if (state[k] > 0) state[k]--;
}

async function getActiveEnemy() {
  const result = await pool.query(
    `SELECT e.*, gi.name AS ssr_icon_name, gi.image_url AS ssr_icon_image_url
     FROM special_gacha_enemies e
     LEFT JOIN gacha_icons gi ON gi.id = e.ssr_icon_id
     WHERE e.is_active = TRUE
     ORDER BY e.id DESC LIMIT 1`
  );
  return result.rows[0] || null;
}

// 排出内容・確率・効果の一覧（画面下の展開パネル用）
router.get('/rates', async (req, res) => {
  try {
    const enemy = await getActiveEnemy();
    const gimmick = getGimmick(enemy && enemy.gimmick);
    const tables = tablesFor(gimmick);
    const [catDamage, catFavorable, catUnfavorable, catDestruction] = tables.cat;
    const unfavorableItems = tables.unfavorable.map(t => {
      const regen = gimmick.shieldRegen && gimmick.shieldRegen[t.key];
      return regen
        ? { label: regen.label, p: t.p, detail: `シールド+${regen.amount}（${t.label}の代わり）` }
        : { label: t.label, p: t.p, detail: t.sub };
    });
    const categories = [
      { ...catDamage, items: tables.damage.map(t => ({ label: t.label, p: t.p, detail: `${t.dmg}ダメージ` })) },
      { ...catFavorable, items: FAVORABLE.map(t => ({ label: t.label, p: t.p, detail: t.sub })) },
      { ...catUnfavorable, items: unfavorableItems },
    ];
    if (gimmick.shieldBreak) {
      categories.push(
        { ...catDestruction, label: 'シールド削りアイテム（シールドがある間）', items: gimmick.shieldBreak.map(t => ({ label: t.label, p: t.p, detail: `シールド-${t.amount}` })) },
        { ...catDestruction, label: '破壊率アイテム（シールドがない間）', items: tables.destruction.map(t => ({ label: t.label, p: t.p, detail: t.sub })) },
      );
    } else {
      categories.push({ ...catDestruction, items: tables.destruction.map(t => ({ label: t.label, p: t.p, detail: t.sub })) });
    }
    res.json({ pull_cost: PULL_COST, gimmick: gimmickSummary(enemy && enemy.gimmick), categories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 現在の敵 + 自分の進行状況 + 所持ptを取得（進行状況が無ければ作成）
router.get('/current', async (req, res) => {
  try {
    const enemy = await getActiveEnemy();
    if (!enemy) return res.json({ enemy: null });

    let progress = (await pool.query(
      'SELECT * FROM user_special_gacha_progress WHERE user_id=$1 AND enemy_id=$2',
      [req.user.id, enemy.id]
    )).rows[0];

    if (!progress) {
      progress = (await pool.query(
        'INSERT INTO user_special_gacha_progress (user_id, enemy_id, current_hp, shield) VALUES ($1,$2,$3,$4) RETURNING *',
        [req.user.id, enemy.id, enemy.max_hp, getGimmick(enemy.gimmick).shield || 0]
      )).rows[0];
    }

    const userResult = await pool.query('SELECT points FROM users WHERE id=$1', [req.user.id]);

    res.json({
      enemy: { id: enemy.id, name: enemy.name, image_url: enemy.image_url, max_hp: enemy.max_hp, ssr_icon_name: enemy.ssr_icon_name, ssr_icon_image_url: enemy.ssr_icon_image_url },
      gimmick: gimmickSummary(enemy.gimmick),
      progress,
      points: userResult.rows[0].points,
      pull_cost: PULL_COST,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.post('/pull', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const enemy = await getActiveEnemy();
    if (!enemy) { await client.query('ROLLBACK'); return res.status(404).json({ error: '現在挑戦できる敵がいません' }); }

    let progress = (await client.query(
      'SELECT * FROM user_special_gacha_progress WHERE user_id=$1 AND enemy_id=$2 FOR UPDATE',
      [req.user.id, enemy.id]
    )).rows[0];
    if (!progress) {
      progress = (await client.query(
        'INSERT INTO user_special_gacha_progress (user_id, enemy_id, current_hp, shield) VALUES ($1,$2,$3,$4) RETURNING *',
        [req.user.id, enemy.id, enemy.max_hp, getGimmick(enemy.gimmick).shield || 0]
      )).rows[0];
    }
    if (progress.defeated_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: '既に討伐済みです' });
    }

    const userResult = await client.query('SELECT points FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
    if (userResult.rows[0].points < PULL_COST) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `ポイントが不足しています（必要: ${PULL_COST}pt）` });
    }
    await client.query('UPDATE users SET points=points-$1 WHERE id=$2', [PULL_COST, req.user.id]);
    await client.query('INSERT INTO point_history (user_id, amount, reason) VALUES ($1,$2,$3)', [req.user.id, -PULL_COST, '討伐ガチャ（10連）']);

    const state = {};
    for (const k of COUNTER_KEYS) state[k] = progress[k];
    state.destruction_rate = parseFloat(progress.destruction_rate);
    state.shield = progress.shield;
    const gimmick = getGimmick(enemy.gimmick);
    const tables = tablesFor(gimmick);
    let hp = progress.current_hp;

    const results = [];
    for (let i = 0; i < PULLS_PER_TRY && hp > 0; i++) {
      const r = rollOne(state, gimmick, tables);
      hp = Math.max(0, Math.min(enemy.max_hp, hp - r.dmg));
      r.state_after = { ...state };
      results.push({ ...r, hp_after: hp });
    }

    let defeated = false;
    let awardedIcon = null;
    if (hp <= 0) {
      defeated = true;
      await client.query(
        'INSERT INTO user_icons (user_id, icon_id) VALUES ($1,$2) ON CONFLICT (user_id, icon_id) DO NOTHING',
        [req.user.id, enemy.ssr_icon_id]
      );
      awardedIcon = { name: enemy.ssr_icon_name, image_url: enemy.ssr_icon_image_url };
    }

    const updated = await client.query(
      `UPDATE user_special_gacha_progress SET
         current_hp=$3, ally_small=$4, ally_large=$5, debuff_small=$6, debuff_large=$7,
         enemybuff_small=$8, enemybuff_large=$9, critup_small=$10, critup_large=$11, destruction_rate=$12,
         defeated_at = CASE WHEN $13 THEN NOW() ELSE defeated_at END, shield=$14, pull_count=pull_count+1
       WHERE user_id=$1 AND enemy_id=$2
       RETURNING *`,
      [req.user.id, enemy.id, hp, state.ally_small, state.ally_large, state.debuff_small, state.debuff_large,
       state.enemybuff_small, state.enemybuff_large, state.critup_small, state.critup_large, state.destruction_rate, defeated, state.shield]
    );

    await client.query('COMMIT');
    res.json({
      results,
      progress: updated.rows[0],
      new_points: userResult.rows[0].points - PULL_COST,
      defeated,
      awarded_icon: awardedIcon,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

module.exports = router;
module.exports.PULL_COST = PULL_COST;
