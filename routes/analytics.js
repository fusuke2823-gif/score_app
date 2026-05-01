const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { authenticateToken, requireAdmin, optionalAuth } = require('../middleware/auth');

router.post('/pageview', optionalAuth, async (req, res) => {
  if (!req.user) return res.json({ ok: true });
  const { page } = req.body;
  if (!page) return res.json({ ok: true });
  try {
    await pool.query(
      'INSERT INTO page_views (user_id, is_internal, page) VALUES ($1, $2, $3)',
      [req.user.id, !!req.user.is_internal, page]
    );
  } catch {}
  res.json({ ok: true });
});

async function getPVData(trunc, start, end) {
  return pool.query(`
    SELECT
      DATE_TRUNC($1, created_at) AS period,
      CASE WHEN page IN ('/index.html', '/') THEN 'index' ELSE 'other' END AS page_type,
      is_internal,
      COUNT(DISTINCT user_id) AS u,
      COUNT(*) AS h
    FROM page_views
    WHERE created_at >= $2 AND created_at < $3
      AND page NOT LIKE '/admin%'
    GROUP BY 1, 2, 3 ORDER BY 1
  `, [trunc, start, end]);
}

async function getNewUsers(trunc, start, end) {
  return pool.query(`
    SELECT
      DATE_TRUNC($1, created_at) AS period,
      COUNT(*) FILTER (WHERE is_internal = TRUE)  AS int_n,
      COUNT(*) FILTER (WHERE is_internal = FALSE) AS ext_n,
      COUNT(*) AS tot_n
    FROM users
    WHERE created_at >= $2 AND created_at < $3
    GROUP BY 1 ORDER BY 1
  `, [trunc, start, end]);
}

function merge(pvRows, newRows) {
  const map = new Map();
  const key = r => r.period instanceof Date ? r.period.toISOString() : String(r.period);
  const empty = () => ({
    index: { iu: 0, eu: 0, tu: 0, ih: 0, eh: 0, th: 0 },
    other: { iu: 0, eu: 0, tu: 0, ih: 0, eh: 0, th: 0 },
    new_int: 0, new_ext: 0, new_tot: 0
  });
  for (const r of pvRows) {
    const k = key(r);
    if (!map.has(k)) map.set(k, { period: r.period, ...empty() });
    const e = map.get(k);
    const tgt = r.page_type === 'index' ? e.index : e.other;
    const u = +r.u, h = +r.h;
    if (r.is_internal) { tgt.iu += u; tgt.ih += h; } else { tgt.eu += u; tgt.eh += h; }
    tgt.tu += u; tgt.th += h;
  }
  for (const r of newRows) {
    const k = key(r);
    if (!map.has(k)) map.set(k, { period: r.period, ...empty() });
    const e = map.get(k);
    e.new_int = +r.int_n; e.new_ext = +r.ext_n; e.new_tot = +r.tot_n;
  }
  return [...map.values()].sort((a, b) => new Date(a.period) - new Date(b.period));
}

router.get('/summary', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const [users, dpv, dn, wpv, wn, mpv, mn] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE is_internal = TRUE)  AS int_n,
          COUNT(*) FILTER (WHERE is_internal = FALSE) AS ext_n,
          COUNT(*) AS tot_n
        FROM users
      `),
      getPVData('day',   start, end),
      getNewUsers('day',   start, end),
      getPVData('week',  start, end),
      getNewUsers('week',  start, end),
      getPVData('month', start, end),
      getNewUsers('month', start, end),
    ]);

    res.json({
      period: { start: start.toISOString().split('T')[0], end: now.toISOString().split('T')[0] },
      users: users.rows[0],
      daily:   merge(dpv.rows, dn.rows),
      weekly:  merge(wpv.rows, wn.rows),
      monthly: merge(mpv.rows, mn.rows),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
