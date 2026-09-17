const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// 管理者限定リリース中。一般公開する際はこの1行を削除する。
router.use(authenticateToken, requireAdmin);

const PULL_COST = 100;
const PULLS_PER_TRY = 10;
const DUR_SMALL = 10, DUR_LARGE = 6;
const DESTRUCTION_MAX = 999.0;
const DESTRUCTION_INC = { destruction_25: 25.0, destruction_50: 50.0, destruction_100: 100.0 };

const CAT = [
  { name: 'damage', p: 0.70 },
  { name: 'favorable', p: 0.10 },
  { name: 'unfavorable', p: 0.10 },
  { name: 'destruction', p: 0.10 },
];
const FAVORABLE = [
  { key: 'ally_small', p: 0.30, label: '味方バフ(小)', sub: '与ダメ+20%・10連' },
  { key: 'ally_large', p: 0.10, label: '味方バフ(大)', sub: '与ダメ+80%・6連' },
  { key: 'debuff_small', p: 0.30, label: '敵デバフ(小)', sub: '与ダメ+20%・10連' },
  { key: 'debuff_large', p: 0.10, label: '敵デバフ(大)', sub: '与ダメ+80%・6連' },
  { key: 'critup_small', p: 0.15, label: '会心率UP(小)', sub: '高ダメ確率1.5倍・10連' },
  { key: 'critup_large', p: 0.05, label: '会心率UP(大)', sub: '高ダメ確率2倍・6連' },
];
const UNFAVORABLE = [
  { key: 'enemybuff_small', p: 0.35, label: '敵バフ(小)', sub: '与ダメ-20%・10連' },
  { key: 'enemybuff_large', p: 0.15, label: '敵バフ(大)', sub: '与ダメ-50%・6連' },
  { key: 'heal_small', p: 0.35, label: '敵の回復(小)', sub: '敵HP+2' },
  { key: 'heal_large', p: 0.15, label: '敵の回復(大)', sub: '敵HP+6' },
];
const DESTRUCTION = [
  { key: 'destruction_25', p: 0.50, label: '破壊率上昇+25%', sub: `破壊率+${DESTRUCTION_INC.destruction_25.toFixed(1)}%` },
  { key: 'destruction_50', p: 0.35, label: '破壊率上昇+50%', sub: `破壊率+${DESTRUCTION_INC.destruction_50.toFixed(1)}%` },
  { key: 'destruction_100', p: 0.15, label: '破壊率上昇+100%', sub: `破壊率+${DESTRUCTION_INC.destruction_100.toFixed(1)}%` },
];
const LARGE_KEYS = new Set(['ally_large', 'debuff_large', 'critup_large', 'enemybuff_large']);
const COUNTER_KEYS = ['ally_small', 'ally_large', 'debuff_small', 'debuff_large', 'enemybuff_small', 'enemybuff_large', 'critup_small', 'critup_large'];

function pick(list) {
  const r = Math.random();
  let acc = 0;
  for (const item of list) {
    acc += item.p;
    if (r < acc) return item;
  }
  return list[list.length - 1];
}

// 1連分の抽選とダメージ計算。state (COUNTER_KEYS を持つオブジェクト) を直接更新する。
function rollOne(state) {
  const cat = pick(CAT);

  if (cat.name === 'damage') {
    const critBoost = 1 + (state.critup_small > 0 ? 0.5 : 0) + (state.critup_large > 0 ? 1.0 : 0);
    const critBase = 0.20, ultraBase = 0.05, missBase = 0.30, normalBase = 0.45;
    const crit = critBase * critBoost, ultra = ultraBase * critBoost;
    const added = (crit - critBase) + (ultra - ultraBase);
    const missShare = missBase / (missBase + normalBase), normalShare = normalBase / (missBase + normalBase);
    const miss = Math.max(0, missBase - added * missShare), normal = Math.max(0, normalBase - added * normalShare);
    const table = [
      { name: 'miss', p: miss, dmg: 1, label: '小攻撃' },
      { name: 'normal', p: normal, dmg: 2, label: '通常攻撃' },
      { name: 'crit', p: crit, dmg: 4, label: '会心の一撃' },
      { name: 'ultra', p: ultra, dmg: 9, label: '必殺技' },
    ];
    const roll = pick(table);
    const allyBonus = (state.ally_small > 0 ? 0.2 : 0) + (state.ally_large > 0 ? 0.8 : 0);
    const debuffBonus = (state.debuff_small > 0 ? 0.2 : 0) + (state.debuff_large > 0 ? 0.8 : 0);
    const enemyPenalty = (state.enemybuff_small > 0 ? 0.2 : 0) + (state.enemybuff_large > 0 ? 0.5 : 0);
    const mult = (1 + allyBonus) * (1 + debuffBonus) * Math.max(0, 1 - enemyPenalty) * (state.destruction_rate / 100);
    const dmg = Math.round(roll.dmg * mult);
    decrementAll(state);
    return { category: 'damage', label: roll.label, dmg };
  }

  if (cat.name === 'favorable') {
    const roll = pick(FAVORABLE);
    state[roll.key] = LARGE_KEYS.has(roll.key) ? DUR_LARGE : DUR_SMALL;
    decrementAll(state);
    return { category: 'favorable', label: roll.label, sub: roll.sub, dmg: 0 };
  }

  if (cat.name === 'destruction') {
    const roll = pick(DESTRUCTION);
    state.destruction_rate = Math.min(DESTRUCTION_MAX, state.destruction_rate + DESTRUCTION_INC[roll.key]);
    decrementAll(state);
    return { category: 'destruction', label: roll.label, sub: roll.sub, dmg: 0 };
  }

  const roll = pick(UNFAVORABLE);
  let dmg = 0;
  if (roll.key === 'heal_small') dmg = -2;
  else if (roll.key === 'heal_large') dmg = -6;
  else state[roll.key] = LARGE_KEYS.has(roll.key) ? DUR_LARGE : DUR_SMALL;
  decrementAll(state);
  return { category: 'unfavorable', label: roll.label, sub: roll.sub, dmg };
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
        'INSERT INTO user_special_gacha_progress (user_id, enemy_id, current_hp) VALUES ($1,$2,$3) RETURNING *',
        [req.user.id, enemy.id, enemy.max_hp]
      )).rows[0];
    }

    const userResult = await pool.query('SELECT points FROM users WHERE id=$1', [req.user.id]);

    res.json({
      enemy: { id: enemy.id, name: enemy.name, image_url: enemy.image_url, max_hp: enemy.max_hp, ssr_icon_name: enemy.ssr_icon_name, ssr_icon_image_url: enemy.ssr_icon_image_url },
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
        'INSERT INTO user_special_gacha_progress (user_id, enemy_id, current_hp) VALUES ($1,$2,$3) RETURNING *',
        [req.user.id, enemy.id, enemy.max_hp]
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
    await client.query('INSERT INTO point_history (user_id, amount, reason) VALUES ($1,$2,$3)', [req.user.id, -PULL_COST, '特殊ガチャ（10連）']);

    const state = {};
    for (const k of COUNTER_KEYS) state[k] = progress[k];
    state.destruction_rate = parseFloat(progress.destruction_rate);
    let hp = progress.current_hp;

    const results = [];
    for (let i = 0; i < PULLS_PER_TRY && hp > 0; i++) {
      const r = rollOne(state);
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
         defeated_at = CASE WHEN $13 THEN NOW() ELSE defeated_at END
       WHERE user_id=$1 AND enemy_id=$2
       RETURNING *`,
      [req.user.id, enemy.id, hp, state.ally_small, state.ally_large, state.debuff_small, state.debuff_large,
       state.enemybuff_small, state.enemybuff_large, state.critup_small, state.critup_large, state.destruction_rate, defeated]
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
