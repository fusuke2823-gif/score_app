// レートのシーズン制。シーズンごとにランクとレートを決め直し、その回の成績と今のレートの差を足していく。
//   水準 L：レートの中身（線形変換 pt と同じ目盛り。画面には出さず、ランクとレートに直して出す）
//   1回ごとに L += k ×（その回の pt − L）。ただし +up / −down まで（そのシーズン初参加の回は +firstUp まで。EX の回は下がらない）。X 未満のあいだは +slowUp まで（その回が X 水準なら +up まで）
//   シーズンの最初は前のシーズンの最後のランクから決め、シーズン中はそのランクの0より下がらない
//   数えるのは最終配布（外部）が済んだ回。各回は受付開始日でシーズンに振り分ける（区切りは2週間ごとの回の始まりの日）
const { ptForEventType, rateForXPt } = require('../routes/rankUtils');
const { FRAMES } = require('./frames');

// ランクの区切り（L）。C 0〜、B 100〜（SA 200万相当）、A 300〜（250万）、S 500〜（300万）、X 1500〜、Ex 3300〜（Xレート1500）
const LEVELS = [['C', 0], ['B', 100], ['A', 300], ['S', 500], ['X', 1500], ['Ex', 3300]];
const LEVEL_OF = Object.fromEntries(LEVELS);
const LEGEND_MIN_RATE = 2000;
const LEGEND_TOP_N = 10;

// firstUp：そのシーズンで初めて参加した回だけの上限（みんなが同じ上限で並ばないように）
// EX は中位以下の成績がばらつくので、EX の回では下がらない（上がるだけ）。EX の換算は通常との順位の割合に合わせたもの（rankUtils の convertExScoreToPoints）。k は 0.6 → 0.5 で、10回でレート2000以上が15人前後
const REGULAR_PARAMS = { k: 0.5, up: 1000, firstUp: 1500, down: 400, slowUp: 200 };
// 前のシーズンのランク → 次のシーズンの最初のランク（A以下は B、S は S0、X 以上は X0。新しく来た人は C）
const REGULAR_START = { C: 'B', B: 'B', A: 'B', S: 'S', X: 'X', Ex: 'X', Legend: 'X' };

const jst = d => new Date(`${d}T00:00:00+09:00`);
// イベントは2週間ごと（金曜11時に始まる）。この周期の始まりをシーズンの区切りにする
const CYCLE_ANCHOR = new Date('2026-10-02T11:00:00+09:00');
const CYCLE_MS = 14 * 24 * 60 * 60 * 1000;
const cycleStartAt = d => new Date(CYCLE_ANCHOR.getTime() + Math.floor((d - CYCLE_ANCHOR) / CYCLE_MS) * CYCLE_MS);
// シーズン：冬 12〜2月、春 3〜5月、夏 6〜8月、秋 9〜11月。2026年9月の秋から
//   各シーズンはその最初の月の1日を含む回から始まる（2026冬なら 11/27 に始まる回から）
const SEASON_NAMES = { 12: '冬', 3: '春', 6: '夏', 9: '秋' };
function regularSeason(year, month) {
  const endMonth = month + 3 > 12 ? month + 3 - 12 : month + 3;
  const endYear = month + 3 > 12 ? year + 1 : year;
  const pad = n => String(n).padStart(2, '0');
  return {
    key: `${year}-${pad(month)}`, name: `${year}${SEASON_NAMES[month]}シーズン`,
    start: cycleStartAt(jst(`${year}-${pad(month)}-01`)), end: cycleStartAt(jst(`${endYear}-${pad(endMonth)}-01`)),
    test: false, params: REGULAR_PARAMS, startMap: REGULAR_START,
  };
}

// 最初の 2026秋 は、セラフ遭遇戦演習#7（9/4 開始）から。それまでの成績は数えず、今のランクから始める
const FIRST_START = new Date('2026-09-04T11:00:00+09:00');

// now までに始まったシーズンを古い順に
function seasonsUntil(now = new Date()) {
  const list = [];
  let y = 2026, m = 9;
  for (;;) {
    const s = list.length ? regularSeason(y, m) : { ...regularSeason(y, m), start: FIRST_START };
    if (s.start > now) break;
    list.push(s);
    m += 3; if (m > 12) { m -= 12; y += 1; }
  }
  return list.filter(s => s.start <= now);
}
const currentSeason = (now = new Date()) => seasonsUntil(now).filter(s => s.end > now).pop() || null;

// 回がシーズンに入るか（$1 = start, $2 = end）。受付開始日がない古い回は受付終了日で
const IN_SEASON = 'COALESCE(submission_start, submission_end) >= $1 AND COALESCE(submission_start, submission_end) < $2';

// 順位の並び：レートが高い順、同じならシーズン内の合計が多い順
const byRate = (a, b) => b.L - a.L || b.total - a.total;
// SQL 用：o が m より上の順位か（x_rate → season_total → id の順に比べる。o・m は users の別名）
const rateAbove = (o, m, oId = `${o}.id`, mId = `${m}.id`) =>
  `(${o}.x_rate > ${m}.x_rate OR (${o}.x_rate = ${m}.x_rate AND (COALESCE(${o}.season_total, 0) > COALESCE(${m}.season_total, 0)` +
  ` OR (COALESCE(${o}.season_total, 0) = COALESCE(${m}.season_total, 0) AND ${oId} < ${mId}))))`;

const tierOf = L => LEVELS.filter(([, v]) => L >= v).pop()[0];

// L からランクと表示用のレートへ。C〜S は各ランクの中で 0〜1000（S は今までどおり L−500）、X 以上は Xレート
function display(L, legend) {
  const rank = tierOf(L);
  if (['X', 'Ex'].includes(rank)) return { rank: legend ? 'Legend' : rank, sRate: 1000, xRate: rateForXPt(L) };
  const i = LEVELS.findIndex(([r]) => r === rank);
  const lo = LEVELS[i][1], hi = LEVELS[i + 1][1];
  return { rank, sRate: rank === 'S' ? L - lo : (L - lo) / (hi - lo) * 1000, xRate: null };
}

// 1回分の変化（EX の回は下がらない）
function step(L, P, p, first = false, eventType = null) {
  const cap = L < LEVEL_OF.X && P < LEVEL_OF.X ? p.slowUp : first ? (p.firstUp ?? p.up) : p.up;
  const floor = eventType === 'score_attack_ex' ? 0 : -p.down;
  return Math.max(floor, Math.min(cap, p.k * (P - L)));
}

// シーズンの最初のランク（初めて計算するときに全員分を記録する。前のシーズンの最後のランク、最初のシーズンは今のランクから）
async function ensureStartRanks(client, season, prev) {
  const has = await client.query('SELECT 1 FROM season_start_ranks WHERE season_key = $1 LIMIT 1', [season.key]);
  if (has.rows.length) return;
  let from;
  if (prev) {
    from = (await client.query('SELECT user_id, final_rank AS rank FROM season_states WHERE season_key = $1', [prev.key])).rows;
    const known = new Set(from.map(r => r.user_id));
    // 前のシーズンの記録がない人（前のシーズンの途中で来た人など）は今のランクから
    from.push(...(await client.query('SELECT id AS user_id, comp_rank AS rank FROM users')).rows.filter(r => !known.has(r.user_id)));
  } else {
    from = (await client.query('SELECT id AS user_id, comp_rank AS rank FROM users')).rows;
  }
  for (const r of from) {
    await client.query(
      'INSERT INTO season_start_ranks (season_key, user_id, start_rank) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [season.key, r.user_id, season.startMap[r.rank || 'C'] || 'B']
    );
  }
}

// シーズンを最初から計算し直して、season_states と users のランク・レートに書く
async function recomputeSeason(client, season, prev, { writeUsers = true } = {}) {
  await ensureStartRanks(client, season, prev);
  const starts = new Map((await client.query('SELECT user_id, start_rank FROM season_start_ranks WHERE season_key = $1', [season.key])).rows.map(r => [r.user_id, r.start_rank]));

  const events = (await client.query(
    `SELECT id, event_type, COALESCE(score_multiplier, 1.0)::float AS mult FROM events
     WHERE is_active = TRUE AND points_distributed_external = TRUE
       AND event_type IN ('score_attack', 'seraph', 'score_attack_ex')
       AND ${IN_SEASON}
     ORDER BY submission_end, (event_type = 'score_attack_ex'), event_number`,
    [season.start, season.end]
  )).rows;

  const st = new Map(); // user_id → { L, floor, n }
  const get = id => {
    if (!st.has(id)) { const L = LEVEL_OF[starts.get(id) || 'C'] ?? LEVEL_OF.B; st.set(id, { L, floor: LEVEL_OF[tierOf(L)], n: 0, total: 0 }); }
    return st.get(id);
  };
  for (const id of starts.keys()) get(id);

  for (const e of events) {
    const { rows } = await client.query(
      `SELECT user_id, MAX(approved_score)::float AS score FROM scores
       WHERE event_id = $1 AND approved_score IS NOT NULL AND user_id IS NOT NULL
         AND ranking_scope IN ('public', 'internal', 'external')
       GROUP BY user_id`,
      [e.id]
    );
    for (const r of rows) {
      const x = get(r.user_id);
      const P = ptForEventType(e.event_type, r.score * e.mult);
      x.L = Math.max(x.floor, x.L + step(x.L, P, season.params, x.n === 0, e.event_type));
      x.n++;
      x.total += P;
    }
  }

  // Legend：Xレート 2000 以上の上位10人
  const legend = new Set([...st.entries()]
    .filter(([, x]) => x.L >= LEVEL_OF.Ex && rateForXPt(x.L) >= LEGEND_MIN_RATE)
    .sort((a, b) => byRate(a[1], b[1]) || a[0] - b[0]).slice(0, LEGEND_TOP_N).map(([id]) => id));

  for (const [id, x] of st) {
    const d = display(x.L, legend.has(id));
    await client.query(
      `INSERT INTO season_states (season_key, user_id, level, events, final_rank, total_pt, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (season_key, user_id) DO UPDATE SET level = $3, events = $4, final_rank = $5, total_pt = $6, updated_at = NOW()`,
      [season.key, id, x.L, x.n, d.rank, x.total]
    );
    if (writeUsers) {
      await client.query('UPDATE users SET comp_rank = $2, s_rate = $3, x_rate = $4, season_total = $5 WHERE id = $1', [id, d.rank, d.sRate, d.xRate, x.total]);
    }
  }
  return { events: events.length, users: st.size };
}

// 終わったシーズンを締める（そのシーズンの回の最終配布が全部済んでいれば）。1位を記録する
async function finalizeSeason(client, season) {
  const done = await client.query('SELECT 1 FROM seasons_done WHERE season_key = $1', [season.key]);
  if (done.rows.length) return false;
  const pending = await client.query(
    `SELECT 1 FROM events WHERE is_active = TRUE AND points_distributed_external = FALSE
       AND event_type IN ('score_attack', 'seraph', 'score_attack_ex')
       AND ${IN_SEASON} LIMIT 1`,
    [season.start, season.end]
  );
  if (pending.rows.length) return false;
  const top = (await client.query(
    'SELECT user_id FROM season_states WHERE season_key = $1 AND events > 0 ORDER BY level DESC, total_pt DESC, user_id LIMIT 1', [season.key]
  )).rows[0];
  await client.query('INSERT INTO seasons_done (season_key, winner_user_id) VALUES ($1, $2)', [season.key, top?.user_id ?? null]);
  // シーズンのフレームは渡さず、1位の人だけがショップで買えるようになる（routes/shop.js）
  return true;
}

// 終わったシーズンを締め、今のシーズンを計算し直す（最終配布のあと・起動時・1時間ごとに呼ぶ）
async function syncSeasons(client, now = new Date()) {
  const list = seasonsUntil(now);
  for (let i = 0; i < list.length; i++) {
    const s = list[i], prev = list[i - 1] || null;
    if (s.end <= now) {
      if (!(await client.query('SELECT 1 FROM seasons_done WHERE season_key = $1', [s.key])).rows.length) {
        // 締まるまでは（最後の回の配布待ち）、このシーズンの結果をランクに出しておく
        await recomputeSeason(client, s, prev);
        await finalizeSeason(client, s);
      }
    } else {
      // 今のシーズン：前のシーズンが締まっていなければ、まだ始めない（前のシーズンの最後の回の配布待ち）
      if (prev && !(await client.query('SELECT 1 FROM seasons_done WHERE season_key = $1', [prev.key])).rows.length) return;
      await recomputeSeason(client, s, prev);
    }
  }
}

// 今ランクとレートに出しているシーズン（前のシーズンが締まるまでは前のシーズン）
async function liveSeasonKey(client, now = new Date()) {
  const list = seasonsUntil(now);
  for (let i = list.length - 1; i > 0; i--) {
    if ((await client.query('SELECT 1 FROM seasons_done WHERE season_key = $1', [list[i - 1].key])).rows.length) return list[i].key;
  }
  return list[0]?.key ?? null;
}

// ===== 1人分のシーズン内の推移（レート更新の通知用） =====
// 画面に出す値（ランク・レート）と、グラフ用の高さ y（ランクの段＋段の中の割合。pt の目盛りは出さない）だけを返す
const TIER_Y = { C: 0, B: 1, A: 2, S: 3, X: 4, Ex: 5, Legend: 5 };
function view(L, legend = false) {
  const d = display(L, legend);
  const rate = ['X', 'Ex', 'Legend'].includes(d.rank) ? d.xRate : d.sRate;
  const frac = d.rank === 'X' ? rate / 1500 : ['Ex', 'Legend'].includes(d.rank) ? (rate - 1500) / 700 : rate / 1000;
  return { rank: d.rank, rate: Math.floor(rate), y: +(TIER_Y[d.rank] + Math.max(0, frac)).toFixed(3) };
}

// その人より上の人数（並びはランキングと同じ：水準 → シーズン内の合計 → 番号）
async function placeOf(client, key, st, userId) {
  const { rows } = await client.query(
    `SELECT COUNT(*) FILTER (WHERE level > $2 OR (level = $2 AND (total_pt > $3 OR (total_pt = $3 AND user_id < $4))))::int AS above,
            COUNT(*)::int AS n
     FROM season_states WHERE season_key = $1 AND events > 0`,
    [key, st.level, st.total_pt, userId]
  );
  return { position: rows[0].above + 1, participants: rows[0].n };
}

async function userProgress(client, userId, now = new Date()) {
  const key = await liveSeasonKey(client, now);
  const season = key && seasonByKey(key);
  if (!season) return null;
  const list = seasonsUntil(now);
  const prev = list[list.findIndex(s => s.key === key) - 1] || null;

  const sr = (await client.query('SELECT start_rank FROM season_start_ranks WHERE season_key = $1 AND user_id = $2', [key, userId])).rows[0];
  let L = LEVEL_OF[sr?.start_rank || 'C'] ?? LEVEL_OF.B;
  const floor = LEVEL_OF[tierOf(L)];
  const start = view(L);
  const events = (await client.query(
    `SELECT id, name, event_type, COALESCE(score_multiplier, 1.0)::float AS mult FROM events
     WHERE is_active = TRUE AND points_distributed_external = TRUE
       AND event_type IN ('score_attack', 'seraph', 'score_attack_ex')
       AND ${IN_SEASON}
     ORDER BY submission_end, (event_type = 'score_attack_ex'), event_number`,
    [season.start, season.end]
  )).rows;
  const best = new Map((await client.query(
    `SELECT event_id, MAX(approved_score)::float AS score FROM scores
     WHERE user_id = $1 AND event_id = ANY($2) AND approved_score IS NOT NULL
       AND ranking_scope IN ('public', 'internal', 'external')
     GROUP BY event_id`,
    [userId, events.map(e => e.id)]
  )).rows.map(r => [r.event_id, r.score]));

  const steps = [];
  for (const e of events) {
    if (!best.has(e.id)) continue;
    const before = view(L);
    L = Math.max(floor, L + step(L, ptForEventType(e.event_type, best.get(e.id) * e.mult), season.params, steps.length === 0, e.event_type));
    steps.push({ event_id: e.id, name: e.name, event_type: e.event_type, before, after: view(L) });
  }

  // 今のランク（Legend は上位10人の判定があるので記録から）と順位
  const st = (await client.query('SELECT level, total_pt, final_rank, events FROM season_states WHERE season_key = $1 AND user_id = $2', [key, userId])).rows[0];
  const cur = view(L, st?.final_rank === 'Legend');
  const place = st && st.events > 0 ? await placeOf(client, key, st, userId) : null;
  if (steps.length) steps[steps.length - 1].after = cur;

  // 前のシーズンの結果（締めてあり、参加していれば）
  let prevResult = null;
  if (prev && (await client.query('SELECT 1 FROM seasons_done WHERE season_key = $1', [prev.key])).rows.length) {
    const ps = (await client.query('SELECT level, total_pt, final_rank, events FROM season_states WHERE season_key = $1 AND user_id = $2', [prev.key, userId])).rows[0];
    if (ps && ps.events > 0) {
      prevResult = { key: prev.key, name: prev.name, ...view(ps.level, ps.final_rank === 'Legend'), ...(await placeOf(client, prev.key, ps, userId)) };
      // 1位（記録された1位）なら、そのシーズンのフレームが買えるようになったことも知らせる
      const won = (await client.query('SELECT 1 FROM seasons_done WHERE season_key = $1 AND winner_user_id = $2', [prev.key, userId])).rows.length > 0;
      const pdef = FRAMES.find(f => f.season === prev.key);
      const pfr = won && pdef && (await client.query('SELECT name FROM frames WHERE css_class = $1', [pdef.cls])).rows[0];
      prevResult.winner = won;
      prevResult.reward = pfr ? { css_class: pdef.cls, name: pfr.name } : null;
    }
  }
  // シーズン1位の報酬のフレーム（管理画面で隠していなければ）
  const def = FRAMES.find(f => f.season === key);
  const fr = def && (await client.query('SELECT name FROM frames WHERE css_class = $1 AND is_active = TRUE', [def.cls])).rows[0];
  const seasonInfo = { key, name: season.name, start: season.start, last_day: new Date(season.end.getTime() - 24 * 60 * 60 * 1000),
    reward: fr ? { css_class: def.cls, name: fr.name } : null };
  return { season: seasonInfo, start, steps, now: cur, ...(place || { position: null, participants: null }),
    legend_rank: cur.rank === 'Legend' && place ? place.position : null, prev: prevResult };
}

const seasonByKey = key => seasonsUntil(new Date('2100-01-01')).find(s => s.key === key) || null;

module.exports = { IN_SEASON, rateAbove, liveSeasonKey, userProgress, seasonByKey, LEVELS, LEGEND_MIN_RATE, seasonsUntil, currentSeason, display, step, recomputeSeason, finalizeSeason, syncSeasons };
