const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { optionalAuth } = require('../middleware/auth');

// お知らせ一覧（有効なもののみ、新しい順）。
// notify はポップアップで知らせる対象かどうか：登録日時で対象を絞ったお知らせは、その日時までに登録したユーザーだけ true。
// 一覧ページには対象に関係なく全員に表示する
router.get('/', optionalAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT a.id, a.title, a.body, a.link_url, a.link_label, a.image_url, a.modal_start, a.modal_end, a.created_at,
              (a.notify_registered_before IS NULL OR u.created_at <= a.notify_registered_before) AS notify
       FROM announcements a
       LEFT JOIN users u ON u.id = $1
       WHERE a.is_active = TRUE ORDER BY a.created_at DESC`,
      [req.user ? req.user.id : null]
    );
    res.json(r.rows.map(a => ({ ...a, notify: a.notify === true })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
