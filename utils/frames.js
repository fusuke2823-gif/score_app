// ランキングフレームの種類。cls は frames.css_class に入る値、colors は枠と飾りのグラデーション。
// 見た目は public/css/style.css の .frame-xxx { --frame-grad; --frame-ornaments }（colors から生成したもの）
// price は最初に登録するときの値段（以後は管理画面で変える）。名前・値段・表示は frames テーブル、色と条件はここ
// conds はショップで買えるようになる条件（すべて満たしたうえで pt で購入）。数えるのは受付が終わった回の公開ランキング
//   { type: 'rank', rank, count }            全属性の順位が rank 位以内だった回が count 回以上
//   { type: 'rank', attr, rank, count }      attr 属性のスコアが全体ランキングで rank 位相当以内だった回が count 回以上
//                                            （ほかの人のベストのスコアと比べる。自分のほかの属性のスコアは比べない）
//   { type: 'attr_rank', attr, rank, count } その属性の順位が rank 位以内だった回が count 回以上
//   { type: 'attr_kinds', rank, kinds }      rank 位以内に入ったことのある属性が kinds 種類以上
//   { type: 'joined', count }                参加した回が count 回以上
//   { type: 'all_attrs', pct: { 種類: 割合 } } 1回のイベントで6属性すべてを投稿し、どの属性もその属性の1位のスコアの「割合」以上
//                                            割合はイベントの種類（score_attack / score_attack_ex / seraph）ごと。進み具合は1回で届いた属性の数の最大
// season があるものはシーズン1位の報酬：シーズン中は見せるだけで買えず、シーズンを締めたら1位の人だけが pt で買える
//   { type: 'any', of: [条件, ...] }          どれか1つを満たせばよい（進み具合はいちばん進んでいるもの。of に1つずつの進み具合）
const FRAMES = [
  { cls: 'frame-gold',      label: 'ゴールド', price: 3000,     colors: ['#fff3b0', '#ffd24a', '#e8a317'], conds: [{ type: 'rank', rank: 1, count: 3 }] },
  { cls: 'frame-neon-pink', label: 'ネオンピンク', price: 2500, colors: ['#ffd1ec', '#ff4dd2', '#c86bff'], conds: [{ type: 'rank', rank: 10, count: 10 }] },
  { cls: 'frame-rainbow',   label: 'レインボー', price: 5000,   colors: ['#ff6b6b', '#ffd93d', '#6bffb0', '#5ec8ff', '#c27bff'], conds: [{ type: 'rank', rank: 1, count: 10 }] },
  // 属性
  { cls: 'frame-attr-fire',    label: '火属性', price: 3000, colors: ['#ffd27a', '#ff6a2a', '#d81e2c'], conds: [{ type: 'attr_rank', attr: '火', rank: 3, count: 10 }, { type: 'attr_rank', attr: '火', rank: 1, count: 1 },
      { type: 'any', of: [{ type: 'attr_rank', attr: '火', rank: 1, count: 5 }, { type: 'rank', attr: '火', rank: 3, count: 5 }] }] },
  { cls: 'frame-attr-ice',     label: '氷属性', price: 3000, colors: ['#f0fdff', '#8fe0ff', '#3a86ff'], conds: [{ type: 'attr_rank', attr: '氷', rank: 3, count: 10 }, { type: 'attr_rank', attr: '氷', rank: 1, count: 1 },
      { type: 'any', of: [{ type: 'attr_rank', attr: '氷', rank: 1, count: 5 }, { type: 'rank', attr: '氷', rank: 3, count: 5 }] }] },
  { cls: 'frame-attr-thunder', label: '雷属性', price: 3000, colors: ['#fffde0', '#fff04a', '#ffb800'], conds: [{ type: 'attr_rank', attr: '雷', rank: 3, count: 10 }, { type: 'attr_rank', attr: '雷', rank: 1, count: 1 },
      { type: 'any', of: [{ type: 'attr_rank', attr: '雷', rank: 1, count: 5 }, { type: 'rank', attr: '雷', rank: 3, count: 5 }] }] },
  { cls: 'frame-attr-light',   label: '光属性', price: 3000, colors: ['#ffffff', '#fff6d0', '#ffe08a', '#fff6d0'], conds: [{ type: 'attr_rank', attr: '光', rank: 3, count: 10 }, { type: 'attr_rank', attr: '光', rank: 1, count: 1 },
      { type: 'any', of: [{ type: 'attr_rank', attr: '光', rank: 1, count: 5 }, { type: 'rank', attr: '光', rank: 3, count: 5 }] }] },
  { cls: 'frame-attr-dark',    label: '闇属性', price: 3000, colors: ['#f0c8ff', '#a855ff', '#4a1590'], conds: [{ type: 'attr_rank', attr: '闇', rank: 3, count: 10 }, { type: 'attr_rank', attr: '闇', rank: 1, count: 1 },
      { type: 'any', of: [{ type: 'attr_rank', attr: '闇', rank: 1, count: 5 }, { type: 'rank', attr: '闇', rank: 3, count: 5 }] }] },
  { cls: 'frame-attr-none',    label: '無属性', price: 3000, colors: ['#ffffff', '#b8bccb', '#6b7086'], conds: [{ type: 'attr_rank', attr: '無', rank: 3, count: 10 }, { type: 'attr_rank', attr: '無', rank: 1, count: 1 },
      { type: 'any', of: [{ type: 'attr_rank', attr: '無', rank: 1, count: 5 }, { type: 'rank', attr: '無', rank: 3, count: 5 }] }] },
  // シャッフル（複数の色をまたぐもの）
  { cls: 'frame-shuffle-soda',   label: 'シャッフル・ソーダ', price: 1500,   colors: ['#5ee7f0', '#a6c8ff', '#ff9ad5'], conds: [{ type: 'all_attrs', pct: { score_attack: 0.95, score_attack_ex: 0.9, seraph: 0.99 } }] },
  { cls: 'frame-shuffle-sunset', label: 'シャッフル・サンセット', price: 3000, colors: ['#ffd36e', '#ff7aa2', '#8a6bff'], conds: [{ type: 'joined', count: 40 }] },
  { cls: 'frame-shuffle-aurora', label: 'シャッフル・オーロラ', price: 2500, colors: ['#7affd6', '#6fa8ff', '#e07aff'], conds: [{ type: 'rank', rank: 5, count: 5 }] },
  { cls: 'frame-shuffle-citrus', label: 'シャッフル・シトラス', price: 2000, colors: ['#fff27a', '#9dff8a', '#4fe3e0'], conds: [{ type: 'attr_kinds', rank: 10, kinds: 3 }] },
  { cls: 'frame-shuffle-berry',  label: 'シャッフル・ベリー', price: 4000,   colors: ['#ff8fb8', '#ff4f7a', '#9b5cff', '#5ec8ff'], conds: [{ type: 'attr_kinds', rank: 10, kinds: 6 }] },
  // シーズン1位の報酬（シーズン中は見せるだけ。締めたら1位の人だけ買える）
  { cls: 'frame-season-2026-09', label: '2026秋シーズン', price: 3000, colors: ['#ffd36b', '#ff8a2e', '#d0302f'], season: '2026-09' },
  { cls: 'frame-season-2026-12', label: '2026冬シーズン', price: 3000, colors: ['#ffffff', '#d9f2ff', '#8ccfff', '#7a9cff'], season: '2026-12' },
];

const frameByClass = cls => FRAMES.find(f => f.cls === cls) || null;

// ここにあって frames テーブルにない種類を、非表示で登録する（起動時に呼ぶ）
async function seedFrames(db) {
  for (const f of FRAMES) {
    await db.query(
      `INSERT INTO frames (name, point_cost, css_class, is_active)
       SELECT $1::varchar, $2::int, $3::varchar, $4::boolean WHERE NOT EXISTS (SELECT 1 FROM frames WHERE css_class = $3::varchar)`,
      [f.label + 'フレーム', f.price, f.cls, !!f.season]
    );
  }
}

// 条件の判定に使う、ユーザーの成績（受付が終わった回・公開ランキング）
//   overall：回ごとの全属性の順位　overallEquiv：属性ごとのスコアの全体ランキングでの相当順位　attrRanks：回・属性ごとの順位
async function getFrameStats(db, userId) {
  const { rows } = await db.query(
    `WITH done AS (
       SELECT id FROM events WHERE is_active = TRUE AND submission_end IS NOT NULL AND submission_end < NOW()
     ),
     sc AS (
       SELECT s.event_id, s.user_id, s.attribute, s.approved_score FROM scores s JOIN done d ON d.id = s.event_id
       WHERE s.approved_score IS NOT NULL AND s.ranking_scope IN ('public', 'external')
     ),
     best AS (
       SELECT DISTINCT ON (event_id, user_id) event_id, user_id, attribute, approved_score
       FROM sc ORDER BY event_id, user_id, approved_score DESC
     ),
     overall AS (
       SELECT event_id, user_id, attribute, RANK() OVER (PARTITION BY event_id ORDER BY approved_score DESC) AS rank FROM best
     ),
     -- 属性ごとのスコアが全体ランキングで何位相当か（自分以外のベストのスコアより下の人数＋1）
     equiv AS (
       SELECT a.event_id, a.attribute,
         1 + (SELECT COUNT(*) FROM best b WHERE b.event_id = a.event_id AND b.user_id <> a.user_id AND b.approved_score > a.approved_score) AS rank
       FROM sc a WHERE a.user_id = $1
     ),
     by_attr AS (
       SELECT event_id, user_id, attribute, approved_score,
         RANK() OVER (PARTITION BY event_id, attribute ORDER BY approved_score DESC) AS rank,
         MAX(approved_score) OVER (PARTITION BY event_id, attribute) AS top
       FROM sc
     )
     SELECT 'overall' AS kind, event_id, attribute, rank::int, NULL::float AS score, NULL::float AS top, NULL AS event_type
     FROM overall WHERE user_id = $1
     UNION ALL
     SELECT 'equiv', event_id, attribute, rank::int, NULL, NULL, NULL FROM equiv
     UNION ALL
     SELECT 'attr', a.event_id, a.attribute, a.rank::int, a.approved_score::float, a.top::float, e.event_type
     FROM by_attr a JOIN events e ON e.id = a.event_id WHERE a.user_id = $1`,
    [userId]
  );
  const pick = kind => rows.filter(r => r.kind === kind).map(r => ({ event: r.event_id, attr: r.attribute, rank: r.rank }));
  // 属性ごとの、その属性の1位に対するスコアの割合
  const attrRanks = rows.filter(r => r.kind === 'attr').map(r => ({
    event: r.event_id, type: r.event_type, attr: r.attribute, rank: r.rank, ratio: r.top > 0 ? r.score / r.top : 0,
  }));
  return { overall: pick('overall'), overallEquiv: pick('equiv'), attrRanks };
}

// 条件1つの進み具合 { now, need, met }
function oneProgress(c, stats) {
  let now = 0, need = 0;
  if (c.type === 'rank' && c.attr) { now = stats.overallEquiv.filter(r => r.attr === c.attr && r.rank <= c.rank).length; need = c.count; }
  else if (c.type === 'rank') { now = stats.overall.filter(r => r.rank <= c.rank).length; need = c.count; }
  else if (c.type === 'attr_rank') { now = stats.attrRanks.filter(r => r.attr === c.attr && r.rank <= c.rank).length; need = c.count; }
  else if (c.type === 'attr_kinds') { now = new Set(stats.attrRanks.filter(r => r.rank <= c.rank).map(r => r.attr)).size; need = c.kinds; }
  else if (c.type === 'joined') { now = stats.overall.length; need = c.count; }
  else if (c.type === 'any') {
    const of = c.of.map(x => oneProgress(x, stats));
    const best = of.find(p => p.met) || of.reduce((a, b) => (b.now / b.need > a.now / a.need ? b : a));
    return { ...best, of };
  }
  else if (c.type === 'all_attrs') {
    // イベントごとに届いた属性を集め、いちばん多く届いた回の属性を返す
    const byEvent = new Map();
    for (const r of stats.attrRanks) if (c.pct[r.type] != null && r.ratio >= c.pct[r.type]) byEvent.set(r.event, [...(byEvent.get(r.event) || []), r.attr]);
    const attrs = [...byEvent.values()].reduce((a, b) => (b.length > a.length ? b : a), []);
    return { now: attrs.length, need: 6, met: attrs.length >= 6, attrs };
  }
  return { now: Math.min(now, need), need, met: now >= need };
}

// 条件すべての進み具合 { met, parts: [条件ごとの { now, need, met }] }
function condProgress(conds, stats) {
  const parts = (conds || []).map(c => oneProgress(c, stats));
  return { met: parts.every(p => p.met), parts };
}

module.exports = { FRAMES, frameByClass, seedFrames, getFrameStats, condProgress };
