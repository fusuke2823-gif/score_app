// 外部最終配布の配布量計算。試算（管理画面）と実際の配布で同じ計算を使う。
//
// 配布量 = ① 参加 + ② 総合順位 + ③ 総合スコア + ④ 属性順位（出した属性ごと） + ⑤ 属性スコア（出した属性ごと）
//   順位ボーナス = 最大値 × (参加人数 - 順位) / (参加人数 - 1)   … 1位で満額、最下位で0（1人だけなら満額）
//   スコアボーナス = 最大値 × 自分のpt / 1位のpt                 … スコアをpt換算した値の比
// ユーザーに見せるのは各ボーナスの額だけで、pt換算の値そのものは出さない。
const { ptForEventType } = require('../routes/rankUtils');

const DIST_BONUS_KEYS = {
  participation: 'dist_bonus_participation',
  overall_rank: 'dist_bonus_overall_rank',
  overall_score: 'dist_bonus_overall_score',
  attr_rank: 'dist_bonus_attr_rank',
  attr_score: 'dist_bonus_attr_score',
};
const DIST_BONUS_DEFAULTS = { participation: 250, overall_rank: 250, overall_score: 150, attr_rank: 40, attr_score: 25 };

async function getDistBonusSettings(db) {
  const r = await db.query('SELECT key, value FROM settings WHERE key = ANY($1)', [Object.values(DIST_BONUS_KEYS)]);
  const byKey = Object.fromEntries(r.rows.map(x => [x.key, parseInt(x.value, 10)]));
  const out = {};
  for (const [name, key] of Object.entries(DIST_BONUS_KEYS)) {
    out[name] = Number.isFinite(byKey[key]) ? byKey[key] : DIST_BONUS_DEFAULTS[name];
  }
  return out;
}

const rankBonus = (rank, n, max) => (n <= 1 ? max : (max * (n - rank)) / (n - 1));
const ptBonus = (pt, topPt, max) => (topPt > 0 ? max * Math.min(1, pt / topPt) : 0);

// 同点は同順位（RANK と同じ：自分より高い人数 + 1）
function rankMap(entries) {
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  const ranks = new Map();
  sorted.forEach((e, i) => {
    const rank = i > 0 && e.score === sorted[i - 1].score ? ranks.get(sorted[i - 1].key) : i + 1;
    ranks.set(e.key, rank);
  });
  return ranks;
}

// event: events の行（id, event_type, score_multiplier）
async function computeExternalDistribution(db, event) {
  const bonus = await getDistBonusSettings(db);
  const mult = parseFloat(event.score_multiplier) || 1.0;
  const toPt = score => ptForEventType(event.event_type, score * mult);

  const r = await db.query(
    `SELECT s.user_id, u.username, s.attribute, MAX(s.approved_score)::float AS score
     FROM scores s JOIN users u ON u.id = s.user_id
     WHERE s.event_id = $1 AND s.approved_score IS NOT NULL AND s.ranking_scope IN ('public', 'external')
     GROUP BY s.user_id, u.username, s.attribute`,
    [event.id]
  );

  const users = new Map();
  const byAttr = new Map();
  for (const row of r.rows) {
    if (!users.has(row.user_id)) users.set(row.user_id, { user_id: row.user_id, username: row.username, attrs: {} });
    users.get(row.user_id).attrs[row.attribute] = row.score;
    if (!byAttr.has(row.attribute)) byAttr.set(row.attribute, []);
    byAttr.get(row.attribute).push({ key: row.user_id, score: row.score });
  }

  const overall = [...users.values()].map(u => ({ key: u.user_id, score: Math.max(...Object.values(u.attrs)) }));
  const n = overall.length;
  const overallRank = rankMap(overall);
  const overallTopPt = Math.max(0, ...overall.map(o => toPt(o.score)));

  const attrInfo = new Map();
  for (const [attr, list] of byAttr) {
    attrInfo.set(attr, { n: list.length, ranks: rankMap(list), topPt: Math.max(0, ...list.map(x => toPt(x.score))) });
  }

  const rows = [...users.values()].map(u => {
    const best = Math.max(...Object.values(u.attrs));
    const rank = overallRank.get(u.user_id);
    const attrs = Object.entries(u.attrs).map(([attribute, score]) => {
      const info = attrInfo.get(attribute);
      const aRank = info.ranks.get(u.user_id);
      return {
        attribute, score, rank: aRank, n: info.n,
        rank_bonus: Math.round(rankBonus(aRank, info.n, bonus.attr_rank)),
        score_bonus: Math.round(ptBonus(toPt(score), info.topPt, bonus.attr_score)),
      };
    });
    const parts = {
      participation: bonus.participation,
      overall_rank: Math.round(rankBonus(rank, n, bonus.overall_rank)),
      overall_score: Math.round(ptBonus(toPt(best), overallTopPt, bonus.overall_score)),
      attr_rank: attrs.reduce((s, a) => s + a.rank_bonus, 0),
      attr_score: attrs.reduce((s, a) => s + a.score_bonus, 0),
    };
    const total = Object.values(parts).reduce((s, v) => s + v, 0);
    return { user_id: u.user_id, username: u.username, rank, best_score: best, best_pt: toPt(best), parts, total, attrs };
  }).sort((a, b) => a.rank - b.rank || b.total - a.total);

  return { bonus, participants: n, rows };
}

module.exports = { DIST_BONUS_KEYS, DIST_BONUS_DEFAULTS, getDistBonusSettings, computeExternalDistribution };
