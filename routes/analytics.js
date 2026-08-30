const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { authenticateToken, requireAdmin, optionalAuth } = require('../middleware/auth');

router.post('/pageview', optionalAuth, async (req, res) => {
  if (!req.user) return res.json({ ok: true });
  let { page } = req.body;
  if (!page) return res.json({ ok: true });
  if (page === '/') page = '/index.html';
  try {
    await pool.query(
      'INSERT INTO page_views (user_id, is_internal, page) VALUES ($1, $2, $3)',
      [req.user.id, !!req.user.is_internal, page]
    );
  } catch {}
  res.json({ ok: true });
});

async function getPVData(trunc, start, end, excludeAdmin) {
  return pool.query(`
    SELECT
      DATE_TRUNC($1, pv.created_at) AS period,
      CASE WHEN pv.page = '/' THEN '/index.html' ELSE pv.page END AS page,
      pv.is_internal,
      COUNT(DISTINCT pv.user_id) AS u,
      COUNT(*) AS h
    FROM page_views pv
    ${excludeAdmin ? "JOIN users u ON u.id = pv.user_id AND u.role != 'admin'" : ''}
    WHERE pv.created_at >= $2 AND pv.created_at < $3
      AND pv.page NOT LIKE '/admin%'
    GROUP BY 1, 2, 3 ORDER BY 1, 2
  `, [trunc, start, end]);
}

async function getNewUsers(trunc, start, end, excludeAdmin) {
  return pool.query(`
    SELECT
      DATE_TRUNC($1, created_at) AS period,
      COUNT(*) FILTER (WHERE is_internal = TRUE)  AS int_n,
      COUNT(*) FILTER (WHERE is_internal = FALSE) AS ext_n,
      COUNT(*) AS tot_n
    FROM users
    WHERE created_at >= $2 AND created_at < $3
    ${excludeAdmin ? "AND role != 'admin'" : ''}
    GROUP BY 1 ORDER BY 1
  `, [trunc, start, end]);
}

function merge(pvRows, newRows) {
  const map = new Map();
  const key = r => r.period instanceof Date ? r.period.toISOString() : String(r.period);
  for (const r of pvRows) {
    const k = key(r);
    if (!map.has(k)) map.set(k, { period: r.period, pages: {}, new_int: 0, new_ext: 0, new_tot: 0 });
    const e = map.get(k);
    if (!e.pages[r.page]) e.pages[r.page] = { iu: 0, eu: 0, tu: 0, ih: 0, eh: 0, th: 0 };
    const t = e.pages[r.page];
    const u = +r.u, h = +r.h;
    if (r.is_internal) { t.iu += u; t.ih += h; } else { t.eu += u; t.eh += h; }
    t.tu += u; t.th += h;
  }
  for (const r of newRows) {
    const k = key(r);
    if (!map.has(k)) map.set(k, { period: r.period, pages: {}, new_int: 0, new_ext: 0, new_tot: 0 });
    const e = map.get(k);
    e.new_int = +r.int_n; e.new_ext = +r.ext_n; e.new_tot = +r.tot_n;
  }
  return [...map.values()].sort((a, b) => new Date(a.period) - new Date(b.period));
}

router.get('/summary', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const now = new Date();

    // 期間指定（?start=YYYY-MM-DD&end=YYYY-MM-DD、start=all で全範囲）。省略時は直近3か月。
    let start;
    if (req.query.start === 'all') {
      start = new Date('2000-01-01');
    } else if (req.query.start) {
      start = new Date(req.query.start);
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      start.setMonth(start.getMonth() - 3);
    }
    let end;
    if (req.query.end) {
      end = new Date(req.query.end);
      end.setDate(end.getDate() + 1); // 指定日を含めるため終端は翌日（exclusive）
    } else {
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    }
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      return res.status(400).json({ error: '不正な期間です' });
    }

    const excludeAdmin = req.query.excludeAdmin === '1';

    const [users, baseline, dpv, dn, wpv, wn, mpv, mn] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE is_internal = TRUE)  AS int_n,
          COUNT(*) FILTER (WHERE is_internal = FALSE) AS ext_n,
          COUNT(*) AS tot_n
        FROM users
        ${excludeAdmin ? "WHERE role != 'admin'" : ''}
      `),
      // 期間開始時点までの累計登録者数（累計グラフのベースライン）
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE is_internal = TRUE)  AS int_n,
          COUNT(*) FILTER (WHERE is_internal = FALSE) AS ext_n,
          COUNT(*) AS tot_n
        FROM users
        WHERE created_at < $1
        ${excludeAdmin ? "AND role != 'admin'" : ''}
      `, [start]),
      getPVData('day',   start, end, excludeAdmin),
      getNewUsers('day',   start, end, excludeAdmin),
      getPVData('week',  start, end, excludeAdmin),
      getNewUsers('week',  start, end, excludeAdmin),
      getPVData('month', start, end, excludeAdmin),
      getNewUsers('month', start, end, excludeAdmin),
    ]);

    const displayEnd = new Date(end);
    displayEnd.setDate(displayEnd.getDate() - 1);
    res.json({
      period: { start: start.toISOString().split('T')[0], end: displayEnd.toISOString().split('T')[0] },
      excludeAdmin,
      users: users.rows[0],
      baselineUsers: baseline.rows[0],
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
