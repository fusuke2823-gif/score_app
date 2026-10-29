const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../db/index');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { GIMMICKS, getGimmick, gimmickSummary } = require('../utils/specialGachaGimmicks');

// ログインユーザーなら誰でも挑戦できる（2026-10-01 一般公開）
router.use(authenticateToken);

const PULL_COST = 100;
const PULLS_PER_TRY = 10;
const FREE_PULLS = 2; // 敵ごとに最初の10連2回（20連）は無料
const freeLeft = progress => Math.max(0, FREE_PULLS - (progress.pull_count || 0));
const DUR_SMALL = 15, DUR_LARGE = 8;
const REWIND_CELLS = 50; // 巻き戻しの判定のコマの数
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
  let unfavorable = UNFAVORABLE.map(t => (heal[t.key] ? { ...t, sub: `敵HP+${heal[t.key]}` } : t));
  // 回復カードなし：不利アイテムは防御UPだけ（小・大の比率はそのまま）
  if (gimmick.noHeal) {
    const rest = unfavorable.filter(t => !HEAL_AMOUNT[t.key]);
    const sum = rest.reduce((n, t) => n + t.p, 0);
    unfavorable = rest.map(t => ({ ...t, p: t.p / sum }));
  }
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
    const allyBonus0 = (state.ally_small > 0 ? 0.5 : 0) + (state.ally_large > 0 ? 2.0 : 0);
    const debuffBonus0 = (state.debuff_small > 0 ? 0.5 : 0) + (state.debuff_large > 0 ? 2.0 : 0);
    const enemyPenalty0 = (state.enemybuff_small > 0 ? 0.2 : 0) + (state.enemybuff_large > 0 ? 0.5 : 0);
    // ゲージアクション：ダメージカードの一部がゲージ攻撃（10連の最後に発動）に置き換わる。
    // 基本ダメージは引いた時点の倍率で確定し、発動時にタイミングの倍率を掛ける
    if (gimmick.gauge && Math.random() < gimmick.gauge.p) {
      const mult0 = (1 + allyBonus0) * (1 + debuffBonus0) * Math.max(0, 1 - enemyPenalty0) * (state.destruction_rate / 100) * (state.rewind_mult || 1);
      decrementAll(state);
      return { category: 'gauge', key: 'gauge_attack', label: 'ゲージ攻撃', dmg: 0, gauge_base: Math.max(1, Math.round(gimmick.gauge.base * mult0)) };
    }
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
    // rewind_mult：巻き戻しギミックの連続による倍率（ほかのギミックでは無し）
    const mult = (1 + allyBonus) * (1 + debuffBonus) * Math.max(0, 1 - enemyPenalty) * (state.destruction_rate / 100) * (state.rewind_mult || 1);
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
    // 管理者のテストでは、テストしているギミックの表を見られる
    const key = req.user.role === 'admin' && GIMMICKS[req.query.gimmick] ? req.query.gimmick : enemy && enemy.gimmick;
    const gimmick = getGimmick(key);
    const tables = tablesFor(gimmick);
    const [catDamage, catFavorable, catUnfavorable, catDestruction] = tables.cat;
    const unfavorableItems = tables.unfavorable.map(t => {
      const regen = gimmick.shieldRegen && gimmick.shieldRegen[t.key];
      return regen
        ? { label: regen.label, p: t.p, detail: `シールド+${regen.amount}（${t.label}の代わり）` }
        : { label: t.label, p: t.p, detail: t.sub };
    });
    // ゲージ攻撃はダメージリソースの一部が置き換わるので、一覧ではダメージから差し引いて別カテゴリとして出す（合計100%）
    const gaugeP = gimmick.gauge ? catDamage.p * gimmick.gauge.p : 0;
    const categories = [
      { ...catDamage, p: catDamage.p - gaugeP, items: tables.damage.map(t => ({ label: t.label, p: t.p, detail: `${t.dmg}ダメージ` })) },
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
    if (gimmick.gauge) {
      categories.splice(1, 0, {
        name: 'gauge', label: 'ゲージ攻撃', p: gaugeP,
        items: [{ label: 'ゲージ攻撃', p: 1, detail: `10連の最後に発動。${gimmick.gauge.tiers.map(t => `${t.name}×${t.mult}`).join(' / ')}（基本${gimmick.gauge.base}ダメージ）` }],
      });
    }
    res.json({ pull_cost: PULL_COST, gimmick: gimmickSummary(key), categories });
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
      free_left: freeLeft(progress),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 10連1回分の抽選。progress（DBの行か、テスト用の同じ形のオブジェクト）は書き換えず、結果と次の状態を返す。
// 本番の /pull と管理者のテスト（/test/pull）で同じものを使う
function playTen(progress, gimmick, maxHp, reset) {
  // 前回発動しないまま残ったゲージ攻撃は、MISS（1倍）で先に発動させる
  const leftoverDmg = (progress.pending_gauge || []).reduce((s, g) => s + g.base, 0);
  const state = {};
  for (const k of COUNTER_KEYS) state[k] = progress[k] || 0;
  state.destruction_rate = parseFloat(progress.destruction_rate);
  state.shield = progress.shield || 0;
  const tables = tablesFor(gimmick);
  let hp = Math.max(0, progress.current_hp - leftoverDmg);

  // 巻き戻しギミック：連続回数で倍率を決める。リセットを選んだら連続を0から
  const rw = gimmick.rewind;
  let streak = progress.rewind_streak || 0, streakDmg = progress.rewind_dmg || 0;
  if (rw && reset) { streak = 0; streakDmg = 0; }
  if (rw) state.rewind_mult = rw.multAt(streak);
  const hpStart = hp;

  const results = [];
  // 途中で倒しても10枚すべて抽選する（カード枚数で討伐が先に分からないように）。
  // 倒した後の分はオーバーキル扱いで、HPは0のまま・進行状況（バフやシールド）にも反映しない
  for (let i = 0; i < PULLS_PER_TRY; i++) {
    const overkill = hp <= 0;
    const r = rollOne(overkill ? { ...state } : state, gimmick, tables);
    if (overkill) r.overkill = true;
    else hp = Math.max(0, Math.min(maxHp, hp - r.dmg));
    r.state_after = { ...state };
    results.push({ ...r, hp_after: hp });
  }

  // 倒す前に引いたゲージ攻撃は発動待ちとして記録（倒した後の分はオーバーキルなので発動しない）
  const pendingGauge = [];
  for (const r of results) {
    if (r.category !== 'gauge' || r.overkill) continue;
    r.gauge_token = crypto.randomBytes(8).toString('hex');
    pendingGauge.push({ token: r.gauge_token, base: r.gauge_base });
  }

  // 巻き戻し：10連のあと、連続回数×pStep（10%）で敵がこの連続で与えたダメージを全部回復する。100%以上なら回復なしでリセット。
  // 抽選は画面のルーレットと同じ形で行う：50コマのうち確率の分だけ赤にするコマをランダムに選び、止まるコマも50コマからランダムに1つ選ぶ。
  // 止まったコマが赤なら巻き戻し（赤の数／50 ＝ 確率。確率は10%刻みなので割り切れる）
  let rewind = null;
  // 画面の判定演出用：今回の確率と結果（safe / rewind / forced）、赤いコマの位置と止まるコマ。確率0%のときは判定なし
  let rewindCheck = null;
  // とどめを刺した10連でも判定する（赤なら、倒したはずの敵がこの連続で削った分を戻して復活する）
  if (rw) {
    streakDmg += hpStart - hp;
    const p = rw.pStep * streak;
    let cells = null, stop = null, hit = false;
    if (p > 0 && p < 1 - 1e-9) {
      const idx = Array.from({ length: REWIND_CELLS }, (_, i) => i);
      for (let i = idx.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      cells = idx.slice(0, Math.round(p * REWIND_CELLS)).sort((x, y) => x - y);
      stop = crypto.randomInt(REWIND_CELLS);
      hit = cells.includes(stop);
    }
    if (p >= 1 - 1e-9) {
      rewind = { type: 'forced', streak: streak + 1 };
      streak = 0; streakDmg = 0;
    } else if (hit) {
      const amount = Math.min(maxHp - hp, streakDmg);
      rewind = { type: 'rewind', amount, chance: Math.round(p * 100) / 100, streak: streak + 1, hp_before: hp };
      hp += amount;
      streak = 0; streakDmg = 0;
    } else {
      streak++;
    }
    if (p > 0) rewindCheck = { chance: Math.min(1, Math.round(p * 100) / 100), result: rewind ? rewind.type : 'safe', cells, stop };
  }

  return {
    results, hp, state, leftoverDmg, rewind, rewindCheck,
    next: { ...state, rewind_mult: undefined, current_hp: hp, pending_gauge: pendingGauge, rewind_streak: streak, rewind_dmg: Math.round(streakDmg) },
  };
}

// 発動待ちのゲージ攻撃を1つ確定する。精度は画面側の申告なので、段階に丸めて上限3倍とする
function resolveGauge(pending, token, accuracy, gimmick) {
  const idx = pending.findIndex(g => g.token === token);
  if (!gimmick.gauge || idx === -1) return null;
  const tier = gimmick.gauge.tiers.find(t => accuracy >= t.min);
  const dmg = Math.round(pending[idx].base * tier.mult);
  return { dmg, tier, pending: pending.filter((_, i) => i !== idx) };
}
function gaugeAccuracy(body) {
  const a = Number(body && body.accuracy);
  return Number.isFinite(a) ? Math.min(1, Math.max(0, a)) : 0;
}

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

    // 前回発動しないまま残ったゲージ攻撃だけで倒せる場合は、ポイントを使わずに討伐として返す
    const leftoverDmg = (progress.pending_gauge || []).reduce((s, g) => s + g.base, 0);
    if (leftoverDmg > 0 && progress.current_hp - leftoverDmg <= 0) {
      await client.query(
        'INSERT INTO user_icons (user_id, icon_id) VALUES ($1,$2) ON CONFLICT (user_id, icon_id) DO NOTHING',
        [req.user.id, enemy.ssr_icon_id]
      );
      const updated = await client.query(
        `UPDATE user_special_gacha_progress SET current_hp=0, pending_gauge='[]'::jsonb, defeated_at=NOW()
         WHERE user_id=$1 AND enemy_id=$2 RETURNING *`,
        [req.user.id, enemy.id]
      );
      const pts = (await client.query('SELECT points FROM users WHERE id=$1', [req.user.id])).rows[0].points;
      await client.query('COMMIT');
      return res.json({
        results: [], progress: updated.rows[0], new_points: pts, defeated: true,
        awarded_icon: { name: enemy.ssr_icon_name, image_url: enemy.ssr_icon_image_url }, leftover_gauge_damage: leftoverDmg,
      });
    }

    // 最初の2回は無料（進み具合の行を押さえてから数えるので、同時に引いても超えない）
    const cost = freeLeft(progress) > 0 ? 0 : PULL_COST;
    const userResult = await client.query('SELECT points FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
    if (userResult.rows[0].points < cost) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `ポイントが不足しています（必要: ${cost}pt）` });
    }
    if (cost > 0) {
      await client.query('UPDATE users SET points=points-$1 WHERE id=$2', [cost, req.user.id]);
      await client.query('INSERT INTO point_history (user_id, amount, reason) VALUES ($1,$2,$3)', [req.user.id, -cost, '討伐ガチャ（10連）']);
    }

    const play = playTen(progress, getGimmick(enemy.gimmick), enemy.max_hp, req.body && req.body.reset === true);
    const { results, hp, state, rewind } = play;

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
         defeated_at = CASE WHEN $13 THEN NOW() ELSE defeated_at END, shield=$14, pull_count=pull_count+1, pending_gauge=$15::jsonb,
         rewind_streak=$16, rewind_dmg=$17
       WHERE user_id=$1 AND enemy_id=$2
       RETURNING *`,
      [req.user.id, enemy.id, hp, state.ally_small, state.ally_large, state.debuff_small, state.debuff_large,
       state.enemybuff_small, state.enemybuff_large, state.critup_small, state.critup_large, state.destruction_rate, defeated, state.shield,
       JSON.stringify(play.next.pending_gauge), play.next.rewind_streak, play.next.rewind_dmg]
    );

    await client.query('COMMIT');
    res.json({
      results,
      progress: updated.rows[0],
      new_points: userResult.rows[0].points - cost,
      free_left: freeLeft(updated.rows[0]),
      defeated,
      awarded_icon: awardedIcon,
      leftover_gauge_damage: play.leftoverDmg,
      rewind,
      rewind_check: play.rewindCheck,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// ゲージアクションの結果を受け取ってダメージを確定する。
// 精度は画面側の申告だが、発動待ちのトークン1つにつき1回だけ受け付け、倍率は段階に丸めて上限3倍とする
router.post('/gauge', async (req, res) => {
  const { token } = req.body || {};
  const accuracy = gaugeAccuracy(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const enemy = await getActiveEnemy();
    if (!enemy) { await client.query('ROLLBACK'); return res.status(404).json({ error: '現在挑戦できる敵がいません' }); }
    const gimmick = getGimmick(enemy.gimmick);
    const progress = (await client.query(
      'SELECT * FROM user_special_gacha_progress WHERE user_id=$1 AND enemy_id=$2 FOR UPDATE',
      [req.user.id, enemy.id]
    )).rows[0];
    const g = resolveGauge(progress ? (progress.pending_gauge || []) : [], token, accuracy, gimmick);
    if (!g) { await client.query('ROLLBACK'); return res.status(400).json({ error: '発動できるゲージ攻撃がありません' }); }

    const { dmg, tier } = g;
    const alreadyDefeated = !!progress.defeated_at;
    const hp = Math.max(0, progress.current_hp - dmg);
    const defeated = !alreadyDefeated && hp <= 0;
    let awardedIcon = null;
    if (defeated) {
      await client.query(
        'INSERT INTO user_icons (user_id, icon_id) VALUES ($1,$2) ON CONFLICT (user_id, icon_id) DO NOTHING',
        [req.user.id, enemy.ssr_icon_id]
      );
      awardedIcon = { name: enemy.ssr_icon_name, image_url: enemy.ssr_icon_image_url };
    }
    const updated = await client.query(
      `UPDATE user_special_gacha_progress SET current_hp=$3, pending_gauge=$4::jsonb,
         defeated_at = CASE WHEN $5 THEN NOW() ELSE defeated_at END
       WHERE user_id=$1 AND enemy_id=$2 RETURNING *`,
      [req.user.id, enemy.id, hp, JSON.stringify(g.pending), defeated]
    );
    await client.query('COMMIT');
    res.json({ dmg, tier: tier.name, mult: tier.mult, overkill: alreadyDefeated, defeated, awarded_icon: awardedIcon, progress: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// ===== 管理者のテスト =====
// 好きなギミックの敵と、ポイントを使わずに戦える。本番の進み具合とは別に保存し、討伐してもアイコンはもらえない
const testRouter = express.Router();
testRouter.use(requireAdmin);

function newTestProgress(gimmickKey) {
  const g = getGimmick(gimmickKey);
  const p = { current_hp: g.max_hp, destruction_rate: 100.0, shield: g.shield || 0, pending_gauge: [], rewind_streak: 0, rewind_dmg: 0, pull_count: 0, defeated_at: null };
  for (const k of COUNTER_KEYS) p[k] = 0;
  return p;
}
// 画面に返す形（本番の /current と同じ）。敵の見た目は今の本番の敵を借りる
async function testView(row) {
  const enemy = await getActiveEnemy();
  const g = getGimmick(row.gimmick);
  return {
    enemy: { id: 0, name: `テスト：${g.label}`, image_url: enemy ? enemy.image_url : null, max_hp: g.max_hp, ssr_icon_name: 'テスト（アイコンはもらえません）', ssr_icon_image_url: enemy ? enemy.ssr_icon_image_url : null },
    gimmick: gimmickSummary(row.gimmick),
    progress: row.progress,
  };
}

testRouter.get('/', async (req, res) => {
  try {
    const r = await pool.query('SELECT gimmick, progress FROM special_gacha_tests WHERE user_id=$1', [req.user.id]);
    const points = (await pool.query('SELECT points FROM users WHERE id=$1', [req.user.id])).rows[0].points;
    res.json({ gimmicks: Object.keys(GIMMICKS).map(gimmickSummary), test: r.rows[0] ? await testView(r.rows[0]) : null, points, pull_cost: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ギミックを選んで最初から
testRouter.post('/start', async (req, res) => {
  const gimmick = req.body && req.body.gimmick;
  if (!GIMMICKS[gimmick]) return res.status(400).json({ error: 'ギミックを選んでください' });
  try {
    const row = { gimmick, progress: newTestProgress(gimmick) };
    await pool.query(
      `INSERT INTO special_gacha_tests (user_id, gimmick, progress, updated_at) VALUES ($1,$2,$3,NOW())
       ON CONFLICT (user_id) DO UPDATE SET gimmick=EXCLUDED.gimmick, progress=EXCLUDED.progress, updated_at=NOW()`,
      [req.user.id, gimmick, row.progress]
    );
    res.json(await testView(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

testRouter.post('/pull', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = (await client.query('SELECT gimmick, progress FROM special_gacha_tests WHERE user_id=$1 FOR UPDATE', [req.user.id])).rows[0];
    if (!r) { await client.query('ROLLBACK'); return res.status(400).json({ error: '先にギミックを選んで始めてください' }); }
    if (r.progress.defeated_at) { await client.query('ROLLBACK'); return res.status(400).json({ error: '討伐済みです。「最初から」で始め直してください' }); }
    const g = getGimmick(r.gimmick);
    const play = playTen(r.progress, g, g.max_hp, req.body && req.body.reset === true);
    const defeated = play.hp <= 0;
    const progress = { ...r.progress, ...play.next, pull_count: (r.progress.pull_count || 0) + 1, defeated_at: defeated ? new Date().toISOString() : null };
    await client.query('UPDATE special_gacha_tests SET progress=$2, updated_at=NOW() WHERE user_id=$1', [req.user.id, progress]);
    const points = (await client.query('SELECT points FROM users WHERE id=$1', [req.user.id])).rows[0].points;
    await client.query('COMMIT');
    res.json({ results: play.results, progress, new_points: points, defeated, awarded_icon: null, leftover_gauge_damage: play.leftoverDmg, rewind: play.rewind, rewind_check: play.rewindCheck });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

testRouter.post('/gauge', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = (await client.query('SELECT gimmick, progress FROM special_gacha_tests WHERE user_id=$1 FOR UPDATE', [req.user.id])).rows[0];
    const g = r && resolveGauge(r.progress.pending_gauge || [], req.body && req.body.token, gaugeAccuracy(req.body), getGimmick(r.gimmick));
    if (!g) { await client.query('ROLLBACK'); return res.status(400).json({ error: '発動できるゲージ攻撃がありません' }); }
    const alreadyDefeated = !!r.progress.defeated_at;
    const hp = Math.max(0, r.progress.current_hp - g.dmg);
    const defeated = !alreadyDefeated && hp <= 0;
    const progress = { ...r.progress, current_hp: hp, pending_gauge: g.pending, defeated_at: defeated ? new Date().toISOString() : r.progress.defeated_at };
    await client.query('UPDATE special_gacha_tests SET progress=$2, updated_at=NOW() WHERE user_id=$1', [req.user.id, progress]);
    await client.query('COMMIT');
    res.json({ dmg: g.dmg, tier: g.tier.name, mult: g.tier.mult, overkill: alreadyDefeated, defeated, awarded_icon: null, progress });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

router.use('/test', testRouter);

// ===== 遊びモード =====
// 本番の敵を倒した人が、同じ敵ともう一度戦える。10連1回 PLAY_COST pt、報酬なし。進み具合は本番とは別（special_gacha_plays）
const PLAY_COST = 10;
const playRouter = express.Router();

function newPlayProgress(enemy) {
  const p = newTestProgress(enemy.gimmick);
  p.current_hp = enemy.max_hp;
  return p;
}
function playView(enemy, progress) {
  return {
    enemy: { id: enemy.id, name: enemy.name, image_url: enemy.image_url, max_hp: enemy.max_hp, ssr_icon_name: '遊びモード（報酬なし）', ssr_icon_image_url: enemy.ssr_icon_image_url },
    gimmick: gimmickSummary(enemy.gimmick),
    progress,
  };
}
// 本番で倒しているか確かめて、今の敵を返す（倒していなければ null）
async function playableEnemy(db, userId) {
  const enemy = await getActiveEnemy();
  if (!enemy) return null;
  const r = await db.query('SELECT defeated_at FROM user_special_gacha_progress WHERE user_id=$1 AND enemy_id=$2', [userId, enemy.id]);
  return r.rows[0] && r.rows[0].defeated_at ? enemy : null;
}

playRouter.get('/', async (req, res) => {
  try {
    const enemy = await playableEnemy(pool, req.user.id);
    if (!enemy) return res.status(400).json({ error: '本番の敵を倒すと遊べます' });
    const r = await pool.query('SELECT progress FROM special_gacha_plays WHERE user_id=$1 AND enemy_id=$2', [req.user.id, enemy.id]);
    const points = (await pool.query('SELECT points FROM users WHERE id=$1', [req.user.id])).rows[0].points;
    res.json({ ...playView(enemy, r.rows[0] ? r.rows[0].progress : newPlayProgress(enemy)), points, pull_cost: PLAY_COST });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 最初から（HP満タンに戻す）
playRouter.post('/start', async (req, res) => {
  try {
    const enemy = await playableEnemy(pool, req.user.id);
    if (!enemy) return res.status(400).json({ error: '本番の敵を倒すと遊べます' });
    const progress = newPlayProgress(enemy);
    await pool.query(
      `INSERT INTO special_gacha_plays (user_id, enemy_id, progress, updated_at) VALUES ($1,$2,$3,NOW())
       ON CONFLICT (user_id, enemy_id) DO UPDATE SET progress=EXCLUDED.progress, updated_at=NOW()`,
      [req.user.id, enemy.id, progress]
    );
    res.json(playView(enemy, progress));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

playRouter.post('/pull', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const enemy = await playableEnemy(client, req.user.id);
    if (!enemy) { await client.query('ROLLBACK'); return res.status(400).json({ error: '本番の敵を倒すと遊べます' }); }
    const row = (await client.query('SELECT progress FROM special_gacha_plays WHERE user_id=$1 AND enemy_id=$2 FOR UPDATE', [req.user.id, enemy.id])).rows[0];
    const cur = row ? row.progress : newPlayProgress(enemy);
    if (cur.defeated_at) { await client.query('ROLLBACK'); return res.status(400).json({ error: '討伐済みです。「最初から」で始め直してください' }); }
    const userResult = await client.query('SELECT points FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
    if (userResult.rows[0].points < PLAY_COST) { await client.query('ROLLBACK'); return res.status(400).json({ error: `ポイントが不足しています（必要: ${PLAY_COST}pt）` }); }
    await client.query('UPDATE users SET points=points-$1 WHERE id=$2', [PLAY_COST, req.user.id]);
    await client.query('INSERT INTO point_history (user_id, amount, reason) VALUES ($1,$2,$3)', [req.user.id, -PLAY_COST, '討伐ガチャ（遊びモード）']);
    const play = playTen(cur, getGimmick(enemy.gimmick), enemy.max_hp, req.body && req.body.reset === true);
    const defeated = play.hp <= 0;
    const progress = { ...cur, ...play.next, pull_count: (cur.pull_count || 0) + 1, defeated_at: defeated ? new Date().toISOString() : null };
    await client.query(
      `INSERT INTO special_gacha_plays (user_id, enemy_id, progress, updated_at) VALUES ($1,$2,$3,NOW())
       ON CONFLICT (user_id, enemy_id) DO UPDATE SET progress=EXCLUDED.progress, updated_at=NOW()`,
      [req.user.id, enemy.id, progress]
    );
    await client.query('COMMIT');
    res.json({ results: play.results, progress, new_points: userResult.rows[0].points - PLAY_COST, defeated, awarded_icon: null, leftover_gauge_damage: play.leftoverDmg, rewind: play.rewind, rewind_check: play.rewindCheck });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

playRouter.post('/gauge', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const enemy = await playableEnemy(client, req.user.id);
    const row = enemy && (await client.query('SELECT progress FROM special_gacha_plays WHERE user_id=$1 AND enemy_id=$2 FOR UPDATE', [req.user.id, enemy.id])).rows[0];
    const g = row && resolveGauge(row.progress.pending_gauge || [], req.body && req.body.token, gaugeAccuracy(req.body), getGimmick(enemy.gimmick));
    if (!g) { await client.query('ROLLBACK'); return res.status(400).json({ error: '発動できるゲージ攻撃がありません' }); }
    const alreadyDefeated = !!row.progress.defeated_at;
    const hp = Math.max(0, row.progress.current_hp - g.dmg);
    const defeated = !alreadyDefeated && hp <= 0;
    const progress = { ...row.progress, current_hp: hp, pending_gauge: g.pending, defeated_at: defeated ? new Date().toISOString() : row.progress.defeated_at };
    await client.query('UPDATE special_gacha_plays SET progress=$3, updated_at=NOW() WHERE user_id=$1 AND enemy_id=$2', [req.user.id, enemy.id, progress]);
    await client.query('COMMIT');
    res.json({ dmg: g.dmg, tier: g.tier.name, mult: g.tier.mult, overkill: alreadyDefeated, defeated, awarded_icon: null, progress });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

router.use('/play', playRouter);

module.exports = router;
module.exports.PULL_COST = PULL_COST;
