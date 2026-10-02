// 共闘目標：イベントの全員の合計スコアが目標に届くと、その回にスコアを出した全員に段階に応じたポイントを一律で足す。
// 目標スコア（100%）はイベントごとに events.coop_target、段階（達成率と付与pt）は全イベント共通で settings に持つ。
// 届いた段階のうち一番上の段階の額だけを渡す（足し算ではない）。
// 合計は公開ランキングと同じ範囲（承認済み・public/external）の全属性のスコア
const COOP_TIERS_KEY = 'coop_tiers';
const COOP_TIERS_DEFAULT = [
  { pct: 100, pts: 100 },
  { pct: 150, pts: 200 },
  { pct: 200, pts: 300 },
];

async function getCoopTiers(db) {
  const r = await db.query('SELECT value FROM settings WHERE key = $1', [COOP_TIERS_KEY]);
  try {
    const tiers = JSON.parse(r.rows[0]?.value);
    if (Array.isArray(tiers) && tiers.length && tiers.every(t => t.pts != null)) return tiers;
  } catch {}
  return COOP_TIERS_DEFAULT;
}

// event: events の行（id, coop_target）。目標が無い回は null
async function getCoopStatus(db, event) {
  const target = Number(event.coop_target);
  if (!target || target <= 0) return null;
  const [tiers, sumResult] = await Promise.all([
    getCoopTiers(db),
    db.query(
      `SELECT COALESCE(SUM(approved_score), 0)::float AS total, COUNT(DISTINCT user_id)::int AS participants
       FROM scores
       WHERE event_id = $1 AND approved_score IS NOT NULL AND ranking_scope IN ('public', 'external')`,
      [event.id]
    ),
  ]);
  const { total, participants } = sumResult.rows[0];
  const progress = (total / target) * 100;
  const reached = tiers.filter(t => progress >= t.pct);
  return {
    total,
    target,
    participants,
    progress,
    tiers: tiers.map(t => ({ pct: t.pct, pts: t.pts, reached: progress >= t.pct })),
    bonus: reached.length ? Math.max(...reached.map(t => t.pts)) : 0,
    reachedPct: reached.length ? Math.max(...reached.map(t => t.pct)) : null,
  };
}

// ユーザー向け（ランキング画面の表示用）
function publicCoop(status) {
  if (!status) return null;
  return {
    total: status.total,
    target: status.target,
    progress: Math.floor(status.progress * 10) / 10,
    participants: status.participants,
    tiers: status.tiers,
    bonus: status.bonus,
  };
}

module.exports = { COOP_TIERS_KEY, COOP_TIERS_DEFAULT, getCoopTiers, getCoopStatus, publicCoop };
