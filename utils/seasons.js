// レートのシーズン制。シーズンごとにランクとレートを決め直し、その回の成績と今のレートの差を足していく。
//   水準 L：レートの中身（線形変換 pt と同じ目盛り。画面には出さず、ランクとレートに直して出す）
//   1回ごとに L += k ×（その回の pt − L）。ただし +up / −down まで。X 未満のあいだは +slowUp まで（その回が X 水準なら +up まで）
//   シーズンの最初は前のシーズンの最後のランクから決め、シーズン中はそのランクより下がらない
//   数えるのは最終配布（外部）が済んだ回。シーズンの区切りは各回の受付終了日（日本時間）
const { ptForEventType, rateForXPt } = require('../routes/rankUtils');

// ランクの区切り（L）。C 0〜、B 100〜（SA 200万相当）、A 300〜（250万）、S 500〜（300万）、X 1500〜、Ex 3300〜（Xレート1500）
const LEVELS = [['C', 0], ['B', 100], ['A', 300], ['S', 500], ['X', 1500], ['Ex', 3300]];
const LEVEL_OF = Object.fromEntries(LEVELS);
const LEGEND_MIN_RATE = 2000;
const LEGEND_TOP_N = 10;

const REGULAR_PARAMS = { k: 0.6, up: 1000, down: 400, slowUp: 200 };
// 前のシーズンのランク → 次のシーズンの最初のランク（A以下は B、S は S0、X 以上は X0。新しく来た人は C）
const REGULAR_START = { C: 'B', B: 'B', A: 'B', S: 'S', X: 'X', Ex: 'X', Legend: 'X' };

const jst = d => new Date(`${d}T00:00:00+09:00`);
// 本シーズン：冬 12〜2月、春 3〜5月、夏 6〜8月、秋 9〜11月。2026年12月の冬から
const SEASON_NAMES = { 12: '冬', 3: '春', 6: '夏', 9: '秋' };
function regularSeason(year, month) {
  const endMonth = month + 3 > 12 ? month + 3 - 12 : month + 3;
  const endYear = month + 3 > 12 ? year + 1 : year;
  const pad = n => String(n).padStart(2, '0');
  return {
    key: `${year}-${pad(month)}`, name: `${year}${SEASON_NAMES[month]}シーズン`,
    start: jst(`${year}-${pad(month)}-01`), end: jst(`${endYear}-${pad(endMonth)}-01`),
    test: false, params: REGULAR_PARAMS, startMap: REGULAR_START,
  };
}

// テストシーズン：#103（2026/10/16 締切）から 11 月末まで。Ex 以上は Ex から始め、1位にフレームは渡さない
const TEST_SEASON = {
  key: '2026-test', name: 'テストシーズン', start: jst('2026-10-03'), end: jst('2026-12-01'),
  test: true, params: { k: 0.4, up: 600, down: 400, slowUp: 200 },
  startMap: { C: 'B', B: 'B', A: 'B', S: 'S', X: 'X', Ex: 'Ex', Legend: 'Ex' },
};

// now までに始まったシーズンを古い順に
function seasonsUntil(now = new Date()) {
  const list = [TEST_SEASON];
  let y = 2026, m = 12;
  for (;;) {
    const s = regularSeason(y, m);
    if (s.start > now) break;
    list.push(s);
    m += 3; if (m > 12) { m -= 12; y += 1; }
  }
  return list.filter(s => s.start <= now);
}
const currentSeason = (now = new Date()) => seasonsUntil(now).filter(s => s.end > now).pop() || null;

const tierOf = L => LEVELS.filter(([, v]) => L >= v).pop()[0];

// L からランクと表示用のレートへ。C〜S は各ランクの中で 0〜1000（S は今までどおり L−500）、X 以上は Xレート
function display(L, legend) {
  const rank = tierOf(L);
  if (['X', 'Ex'].includes(rank)) return { rank: legend ? 'Legend' : rank, sRate: 1000, xRate: rateForXPt(L) };
  const i = LEVELS.findIndex(([r]) => r === rank);
  const lo = LEVELS[i][1], hi = LEVELS[i + 1][1];
  return { rank, sRate: rank === 'S' ? L - lo : (L - lo) / (hi - lo) * 1000, xRate: null };
}

// 1回分の変化
function step(L, P, p) {
  const cap = L < LEVEL_OF.X && P < LEVEL_OF.X ? p.slowUp : p.up;
  return Math.max(-p.down, Math.min(cap, p.k * (P - L)));
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
       AND submission_end >= $1 AND submission_end < $2
     ORDER BY submission_end, (event_type = 'score_attack_ex'), event_number`,
    [season.start, season.end]
  )).rows;

  const st = new Map(); // user_id → { L, floor, n }
  const get = id => {
    if (!st.has(id)) { const L = LEVEL_OF[starts.get(id) || 'C']; st.set(id, { L, floor: L, n: 0 }); }
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
      x.n++;
      x.L = Math.max(x.floor, x.L + step(x.L, ptForEventType(e.event_type, r.score * e.mult), season.params));
    }
  }

  // Legend：Xレート 2000 以上の上位10人
  const legend = new Set([...st.entries()]
    .filter(([, x]) => x.L >= LEVEL_OF.Ex && rateForXPt(x.L) >= LEGEND_MIN_RATE)
    .sort((a, b) => b[1].L - a[1].L).slice(0, LEGEND_TOP_N).map(([id]) => id));

  for (const [id, x] of st) {
    const d = display(x.L, legend.has(id));
    await client.query(
      `INSERT INTO season_states (season_key, user_id, level, events, final_rank, updated_at) VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (season_key, user_id) DO UPDATE SET level = $3, events = $4, final_rank = $5, updated_at = NOW()`,
      [season.key, id, x.L, x.n, d.rank]
    );
    if (writeUsers) {
      await client.query('UPDATE users SET comp_rank = $2, s_rate = $3, x_rate = $4 WHERE id = $1', [id, d.rank, d.sRate, d.xRate]);
    }
  }
  return { events: events.length, users: st.size };
}

// 終わったシーズンを締める（そのシーズンの回の最終配布が全部済んでいれば）。1位を記録し、本シーズンならフレームを渡す
async function finalizeSeason(client, season) {
  const done = await client.query('SELECT 1 FROM seasons_done WHERE season_key = $1', [season.key]);
  if (done.rows.length) return false;
  const pending = await client.query(
    `SELECT 1 FROM events WHERE is_active = TRUE AND points_distributed_external = FALSE
       AND event_type IN ('score_attack', 'seraph', 'score_attack_ex')
       AND submission_end >= $1 AND submission_end < $2 LIMIT 1`,
    [season.start, season.end]
  );
  if (pending.rows.length) return false;
  const top = (await client.query(
    'SELECT user_id FROM season_states WHERE season_key = $1 AND events > 0 ORDER BY level DESC, user_id LIMIT 1', [season.key]
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

const seasonByKey = key => [TEST_SEASON, ...seasonsUntil(new Date('2100-01-01'))].find(s => s.key === key) || null;

module.exports = { seasonByKey, LEVELS, LEGEND_MIN_RATE, TEST_SEASON, seasonsUntil, currentSeason, display, step, recomputeSeason, finalizeSeason, syncSeasons };
