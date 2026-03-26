const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const pool = require('../db/index');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

router.use(authenticateToken, requireAdmin);

// 承認待ちスコア一覧
router.get('/pending', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.username, e.event_number, e.name AS event_name
       FROM scores s
       JOIN users u ON s.user_id = u.id
       JOIN events e ON s.event_id = e.id
       WHERE s.status = 'pending'
       ORDER BY s.updated_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 承認
router.post('/scores/:id/approve', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE scores SET
         approved_score = pending_score,
         approved_image_url = COALESCE(pending_image_url, approved_image_url),
         pending_score = NULL,
         pending_image_url = NULL,
         status = 'approved',
         admin_note = NULL,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'スコアが見つかりません' });
    res.json({ message: '承認しました', score: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 却下
router.post('/scores/:id/reject', async (req, res) => {
  const { note } = req.body;
  try {
    const result = await pool.query(
      `UPDATE scores SET
         status = 'rejected',
         admin_note = $2,
         pending_score = NULL,
         pending_image_url = NULL,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, note || null]
    );
    res.json({ message: '却下しました', score: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// イベント一覧（管理用：全件）
router.get('/events', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM events ORDER BY event_number DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// イベント作成
router.post('/events', async (req, res) => {
  const { event_number, name, description, submission_start, submission_end } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO events (event_number, name, description, submission_start, submission_end) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [event_number, name, description || null, submission_start || null, submission_end || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'このイベント番号は既に存在します' });
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// イベント更新
router.put('/events/:id', async (req, res) => {
  const { name, description, is_active, submission_start, submission_end } = req.body;
  try {
    const result = await pool.query(
      'UPDATE events SET name=$1, description=$2, is_active=$3, submission_start=$4, submission_end=$5 WHERE id=$6 RETURNING *',
      [name, description || null, is_active !== false, submission_start || null, submission_end || null, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// イベントルール保存（全件置き換え）
router.put('/events/:id/rules', async (req, res) => {
  const { rules } = req.body;
  try {
    await pool.query('DELETE FROM event_rules WHERE event_id = $1', [req.params.id]);
    if (rules && rules.length > 0) {
      for (let i = 0; i < rules.length; i++) {
        if (rules[i].trim()) {
          await pool.query(
            'INSERT INTO event_rules (event_id, rule_text, order_index) VALUES ($1, $2, $3)',
            [req.params.id, rules[i].trim(), i]
          );
        }
      }
    }
    res.json({ message: '保存しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 敵追加
router.post('/events/:id/enemies', upload.single('image'), async (req, res) => {
  const { name, hp, dp, ep, use_ep, destruction_rate, order_index, rules, weak_attributes } = req.body;
  try {
    let imageUrl = null;
    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ folder: 'hbr-ranking/enemies', resource_type: 'image' }, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          })
          .end(req.file.buffer);
      });
      imageUrl = uploadResult.secure_url;
    }

    const enemyResult = await pool.query(
      `INSERT INTO enemies (event_id, name, image_url, hp, dp, ep, use_ep, destruction_rate, order_index, weak_attributes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        req.params.id, name, imageUrl,
        hp || null, dp || null, ep || null,
        use_ep === 'true', destruction_rate || null,
        parseInt(order_index) || 0, weak_attributes || null
      ]
    );

    const enemy = enemyResult.rows[0];
    if (rules) {
      const rulesArray = JSON.parse(rules);
      for (let i = 0; i < rulesArray.length; i++) {
        if (rulesArray[i].trim()) {
          await pool.query(
            'INSERT INTO enemy_rules (enemy_id, rule_text, order_index) VALUES ($1,$2,$3)',
            [enemy.id, rulesArray[i].trim(), i]
          );
        }
      }
    }

    res.json(enemy);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 敵更新
router.put('/enemies/:id', upload.single('image'), async (req, res) => {
  const { name, hp, dp, ep, use_ep, destruction_rate, order_index, rules, weak_attributes } = req.body;
  try {
    let imageUrl = null;
    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ folder: 'hbr-ranking/enemies', resource_type: 'image' }, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          })
          .end(req.file.buffer);
      });
      imageUrl = uploadResult.secure_url;
    }

    let result;
    if (imageUrl) {
      result = await pool.query(
        `UPDATE enemies SET name=$1, image_url=$2, hp=$3, dp=$4, ep=$5, use_ep=$6,
         destruction_rate=$7, order_index=$8, weak_attributes=$9 WHERE id=$10 RETURNING *`,
        [name, imageUrl, hp || null, dp || null, ep || null, use_ep === 'true',
         destruction_rate || null, parseInt(order_index) || 0, weak_attributes || null, req.params.id]
      );
    } else {
      result = await pool.query(
        `UPDATE enemies SET name=$1, hp=$2, dp=$3, ep=$4, use_ep=$5,
         destruction_rate=$6, order_index=$7, weak_attributes=$8 WHERE id=$9 RETURNING *`,
        [name, hp || null, dp || null, ep || null, use_ep === 'true',
         destruction_rate || null, parseInt(order_index) || 0, weak_attributes || null, req.params.id]
      );
    }

    if (rules) {
      await pool.query('DELETE FROM enemy_rules WHERE enemy_id=$1', [req.params.id]);
      const rulesArray = JSON.parse(rules);
      for (let i = 0; i < rulesArray.length; i++) {
        if (rulesArray[i].trim()) {
          await pool.query(
            'INSERT INTO enemy_rules (enemy_id, rule_text, order_index) VALUES ($1,$2,$3)',
            [req.params.id, rulesArray[i].trim(), i]
          );
        }
      }
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 敵削除
router.delete('/enemies/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM enemies WHERE id=$1', [req.params.id]);
    res.json({ message: '削除しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 通知設定取得
router.get('/settings', async (req, res) => {
  try {
    const result = await pool.query("SELECT key, value FROM settings WHERE key IN ('notify_on_submit', 'app_version')");
    const map = {};
    result.rows.forEach(r => { map[r.key] = r.value; });
    res.json({
      notify_on_submit: map['notify_on_submit'] === 'true',
      app_version: map['app_version'] || '4.00.65'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 通知設定更新
router.put('/settings', async (req, res) => {
  const { notify_on_submit, app_version } = req.body;
  try {
    if (notify_on_submit !== undefined) {
      await pool.query(
        "INSERT INTO settings (key, value) VALUES ('notify_on_submit', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
        [notify_on_submit ? 'true' : 'false']
      );
    }
    if (app_version !== undefined) {
      await pool.query(
        "INSERT INTO settings (key, value) VALUES ('app_version', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
        [String(app_version)]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ===== 称号管理 =====
router.get('/titles', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM titles ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.post('/titles', async (req, res) => {
  const { name, description, point_cost } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO titles (name, description, point_cost) VALUES ($1, $2, $3) RETURNING *',
      [name, description || null, point_cost || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.put('/titles/:id', async (req, res) => {
  const { name, description, point_cost, is_active } = req.body;
  try {
    const result = await pool.query(
      'UPDATE titles SET name=$1, description=$2, point_cost=$3, is_active=$4 WHERE id=$5 RETURNING *',
      [name, description || null, point_cost || null, is_active !== false, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.patch('/titles/:id/description', async (req, res) => {
  const { description } = req.body;
  try {
    await pool.query('UPDATE titles SET description=$1 WHERE id=$2', [description || null, req.params.id]);
    res.json({ message: '説明を更新しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.patch('/titles/:id/visibility', async (req, res) => {
  const { is_active } = req.body;
  try {
    await pool.query('UPDATE titles SET is_active=$1 WHERE id=$2', [is_active, req.params.id]);
    res.json({ message: is_active ? 'ショップに表示しました' : 'ショップから非表示にしました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.delete('/titles/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE users SET equipped_title_id=NULL WHERE equipped_title_id=$1', [req.params.id]);
    await client.query('DELETE FROM user_titles WHERE title_id=$1', [req.params.id]);
    await client.query('DELETE FROM titles WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ message: '削除しました' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// ===== ポイント配布 =====
// 中間配布可能なイベント一覧（開催中・未最終配布）
router.get('/events/interim-distributable', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*,
        COALESCE(
          (SELECT json_agg(d ORDER BY d.distributed_at DESC)
           FROM event_interim_distributions d
           WHERE d.event_id = e.id),
          '[]'::json
        ) AS interim_history
       FROM events e
       WHERE e.is_active = TRUE AND e.points_distributed = FALSE
         AND (e.submission_start IS NULL OR e.submission_start <= NOW())
       ORDER BY e.event_number DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 中間配布実行
router.post('/events/:id/distribute-interim', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const eventResult = await client.query('SELECT * FROM events WHERE id=$1', [req.params.id]);
    if (eventResult.rows.length === 0) return res.status(404).json({ error: 'イベントが見つかりません' });
    const event = eventResult.rows[0];
    if (event.points_distributed) return res.status(409).json({ error: 'すでに最終配布済みです' });

    const rankResult = await client.query(
      `WITH best AS (
         SELECT DISTINCT ON (user_id)
           user_id, approved_score
         FROM scores
         WHERE event_id=$1 AND approved_score IS NOT NULL
         ORDER BY user_id, approved_score DESC
       )
       SELECT user_id, approved_score,
         RANK() OVER (ORDER BY approved_score DESC) AS rank
       FROM best`,
      [req.params.id]
    );

    const rpResult = await client.query(
      "SELECT key, value FROM settings WHERE key IN ('rank_pts_1','rank_pts_2','rank_pts_3','rank_pts_4','rank_pts_5','rank_pts_6','rank_pts_7','rank_pts_8','rank_pts_9','rank_pts_10','rank_pts_11_15','rank_pts_16_20','rank_pts_21_25','rank_pts_26_30','rank_pts_31plus')"
    );
    const rp = {};
    rpResult.rows.forEach(r => { rp[r.key] = parseInt(r.value); });
    const rankPts = (rank) => {
      if (rank === 1)  return rp.rank_pts_1      ?? 100;
      if (rank === 2)  return rp.rank_pts_2      ?? 95;
      if (rank === 3)  return rp.rank_pts_3      ?? 95;
      if (rank === 4)  return rp.rank_pts_4      ?? 90;
      if (rank === 5)  return rp.rank_pts_5      ?? 90;
      if (rank === 6)  return rp.rank_pts_6      ?? 80;
      if (rank === 7)  return rp.rank_pts_7      ?? 80;
      if (rank === 8)  return rp.rank_pts_8      ?? 80;
      if (rank === 9)  return rp.rank_pts_9      ?? 80;
      if (rank === 10) return rp.rank_pts_10     ?? 80;
      if (rank <= 15)  return rp.rank_pts_11_15  ?? 60;
      if (rank <= 20)  return rp.rank_pts_16_20  ?? 50;
      if (rank <= 25)  return rp.rank_pts_21_25  ?? 30;
      if (rank <= 30)  return rp.rank_pts_26_30  ?? 20;
      return rp.rank_pts_31plus ?? 10;
    };

    let distributed = 0;
    for (const row of rankResult.rows) {
      const pts = rankPts(Number(row.rank));
      await client.query('UPDATE users SET points = points + $1 WHERE id = $2', [pts, row.user_id]);
      await client.query(
        'INSERT INTO point_history (user_id, amount, reason) VALUES ($1, $2, $3)',
        [row.user_id, pts, `第${event.event_number}回 ${event.name} ${row.rank}位（中間配布）`]
      );
      distributed++;
    }

    await client.query(
      'INSERT INTO event_interim_distributions (event_id, distributed_count) VALUES ($1, $2)',
      [req.params.id, distributed]
    );

    await client.query('COMMIT');
    res.json({ message: `${distributed}名に中間配布しました` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// ポイント配布可能なイベント一覧（終了済み・未配布）
router.get('/events/distributable', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM events
       WHERE points_distributed = FALSE
         AND submission_end IS NOT NULL
         AND submission_end < NOW()
       ORDER BY event_number DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ポイント配布実行
router.post('/events/:id/distribute-points', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { award_titles = {} } = req.body || {};

    const eventResult = await client.query('SELECT * FROM events WHERE id=$1', [req.params.id]);
    if (eventResult.rows.length === 0) return res.status(404).json({ error: 'イベントが見つかりません' });
    const event = eventResult.rows[0];
    if (event.points_distributed) return res.status(409).json({ error: 'すでに配布済みです' });

    // 全属性最高スコアでランキングを計算
    const rankResult = await client.query(
      `WITH best AS (
         SELECT DISTINCT ON (user_id)
           user_id, approved_score
         FROM scores
         WHERE event_id=$1 AND approved_score IS NOT NULL
         ORDER BY user_id, approved_score DESC
       )
       SELECT user_id, approved_score,
         RANK() OVER (ORDER BY approved_score DESC) AS rank
       FROM best`,
      [req.params.id]
    );

    const rpResult = await client.query(
      "SELECT key, value FROM settings WHERE key IN ('rank_pts_1','rank_pts_2','rank_pts_3','rank_pts_4','rank_pts_5','rank_pts_6','rank_pts_7','rank_pts_8','rank_pts_9','rank_pts_10','rank_pts_11_15','rank_pts_16_20','rank_pts_21_25','rank_pts_26_30','rank_pts_31plus')"
    );
    const rp = {};
    rpResult.rows.forEach(r => { rp[r.key] = parseInt(r.value); });
    const rankPts = (rank) => {
      if (rank === 1)  return rp.rank_pts_1      ?? 100;
      if (rank === 2)  return rp.rank_pts_2      ?? 95;
      if (rank === 3)  return rp.rank_pts_3      ?? 95;
      if (rank === 4)  return rp.rank_pts_4      ?? 90;
      if (rank === 5)  return rp.rank_pts_5      ?? 90;
      if (rank === 6)  return rp.rank_pts_6      ?? 80;
      if (rank === 7)  return rp.rank_pts_7      ?? 80;
      if (rank === 8)  return rp.rank_pts_8      ?? 80;
      if (rank === 9)  return rp.rank_pts_9      ?? 80;
      if (rank === 10) return rp.rank_pts_10     ?? 80;
      if (rank <= 15)  return rp.rank_pts_11_15  ?? 60;
      if (rank <= 20)  return rp.rank_pts_16_20  ?? 50;
      if (rank <= 25)  return rp.rank_pts_21_25  ?? 30;
      if (rank <= 30)  return rp.rank_pts_26_30  ?? 20;
      return rp.rank_pts_31plus ?? 10;
    };

    let distributed = 0;
    for (const row of rankResult.rows) {
      let pts = rankPts(Number(row.rank));
      await client.query('UPDATE users SET points = points + $1 WHERE id = $2', [pts, row.user_id]);
      await client.query(
        'INSERT INTO point_history (user_id, amount, reason) VALUES ($1, $2, $3)',
        [row.user_id, pts, `第${event.event_number}回 ${event.name} ${row.rank}位`]
      );
      distributed++;
    }

    // 称号付与
    const awardedTitles = [];
    const rankTitleDefs = [
      { key: 'rank1', rank: 1, label: '優勝' },
      { key: 'rank2', rank: 2, label: '準優勝' },
      { key: 'rank3', rank: 3, label: '3位' },
    ];
    for (const def of rankTitleDefs) {
      if (!award_titles[def.key]) continue;
      const targets = rankResult.rows.filter(r => Number(r.rank) === def.rank);
      for (const row of targets) {
        const titleName = `${event.name}${def.label}`;
        const tr = await client.query(
          'INSERT INTO titles (name, description, point_cost, is_active) VALUES ($1, $2, NULL, TRUE) RETURNING id',
          [titleName, `${event.name} ${def.rank}位達成`]
        );
        await client.query(
          'INSERT INTO user_titles (user_id, title_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [row.user_id, tr.rows[0].id]
        );
        if (!awardedTitles.includes(titleName)) awardedTitles.push(titleName);
      }
    }
    const ATTRIBUTES = ['火', '氷', '雷', '光', '闇', '無'];
    for (const attr of ATTRIBUTES) {
      if (!award_titles[`attr_${attr}`]) continue;
      const attrResult = await client.query(
        `SELECT DISTINCT ON (user_id) user_id, approved_score FROM scores
         WHERE event_id=$1 AND approved_score IS NOT NULL AND attribute=$2
         ORDER BY user_id, approved_score DESC`,
        [req.params.id, attr]
      );
      if (attrResult.rows.length === 0) continue;
      const best = attrResult.rows.reduce((a, b) => b.approved_score > a.approved_score ? b : a);
      const titleName = `${event.name} ${attr}属性1位`;
      const tr = await client.query(
        'INSERT INTO titles (name, description, point_cost, is_active) VALUES ($1, $2, NULL, TRUE) RETURNING id',
        [titleName, `${event.name} ${attr}属性 1位達成`]
      );
      await client.query(
        'INSERT INTO user_titles (user_id, title_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [best.user_id, tr.rows[0].id]
      );
      awardedTitles.push(titleName);

      // 属性1位3回達成で「X神」称号付与
      const countResult = await client.query(
        `SELECT COUNT(*) FROM user_titles ut
         JOIN titles t ON t.id = ut.title_id
         WHERE ut.user_id = $1 AND t.name LIKE $2`,
        [best.user_id, `%${attr}属性1位`]
      );
      if (parseInt(countResult.rows[0].count) >= 3) {
        const godTitle = `${attr}神`;
        const already = await client.query(
          `SELECT 1 FROM user_titles ut JOIN titles t ON t.id=ut.title_id WHERE ut.user_id=$1 AND t.name=$2`,
          [best.user_id, godTitle]
        );
        if (already.rows.length === 0) {
          const godTr = await client.query(
            'INSERT INTO titles (name, description, point_cost, is_active) VALUES ($1, $2, NULL, TRUE) RETURNING id',
            [godTitle, `${attr}属性1位を3回達成`]
          );
          await client.query(
            'INSERT INTO user_titles (user_id, title_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [best.user_id, godTr.rows[0].id]
          );
          awardedTitles.push(godTitle);
        }
      }
    }

    await client.query('UPDATE events SET points_distributed=TRUE, points_distributed_at=NOW() WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');

    const titleMsg = awardedTitles.length ? `　称号付与: ${awardedTitles.join(', ')}` : '';
    res.json({ message: `${distributed}名にポイントを配布しました${titleMsg}` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// ユーザー一覧（管理用）
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.role, u.points, u.gp, u.created_at, u.total_login_days,
              t.name AS equipped_title
       FROM users u
       LEFT JOIN titles t ON u.equipped_title_id = t.id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ロール変更
router.patch('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: '無効なロールです' });
  if (String(req.params.id) === String(req.user.id)) return res.status(400).json({ error: '自分のロールは変更できません' });
  try {
    await pool.query('UPDATE users SET role=$1 WHERE id=$2', [role, req.params.id]);
    res.json({ message: role === 'admin' ? '管理者に変更しました' : '一般ユーザーに変更しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 称号付与
router.post('/users/:id/grant-title', async (req, res) => {
  const { title_id } = req.body;
  if (!title_id) return res.status(400).json({ error: '称号を選択してください' });
  try {
    const titleResult = await pool.query('SELECT * FROM titles WHERE id=$1', [title_id]);
    if (titleResult.rows.length === 0) return res.status(404).json({ error: '称号が見つかりません' });
    await pool.query(
      'INSERT INTO user_titles (user_id, title_id) VALUES ($1, $2) ON CONFLICT (user_id, title_id) DO NOTHING',
      [req.params.id, title_id]
    );
    res.json({ message: `「${titleResult.rows[0].name}」を付与しました` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ユーザー削除
router.delete('/users/:id', async (req, res) => {
  if (String(req.params.id) === String(req.user.id)) return res.status(400).json({ error: '自分のアカウントは削除できません' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM user_titles WHERE user_id=$1', [req.params.id]);
    await client.query('DELETE FROM point_history WHERE user_id=$1', [req.params.id]);
    await client.query('DELETE FROM scores WHERE user_id=$1', [req.params.id]);
    await client.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ message: 'ユーザーを削除しました' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// 手動ポイント付与
router.post('/points/grant', async (req, res) => {
  const { user_id, amount, reason } = req.body;
  if (!amount || isNaN(amount)) return res.status(400).json({ error: '付与ポイント数を入力してください' });
  const pts = parseInt(amount, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let count = 0;
    if (user_id) {
      // 特定ユーザーに付与
      await client.query('UPDATE users SET points = points + $1 WHERE id = $2', [pts, user_id]);
      await client.query('INSERT INTO point_history (user_id, amount, reason) VALUES ($1, $2, $3)', [user_id, pts, reason || '管理者付与']);
      count = 1;
    } else {
      // 全員に付与
      const users = await client.query('SELECT id FROM users');
      for (const u of users.rows) {
        await client.query('UPDATE users SET points = points + $1 WHERE id = $2', [pts, u.id]);
        await client.query('INSERT INTO point_history (user_id, amount, reason) VALUES ($1, $2, $3)', [u.id, pts, reason || '管理者付与（全員）']);
        count++;
      }
    }
    await client.query('COMMIT');
    res.json({ message: `${count}名に ${pts}pt を付与しました` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// ポイント履歴一覧（管理用）
router.get('/point-history', async (req, res) => {
  const { user_id, limit = 50, offset = 0 } = req.query;
  try {
    const params = [];
    let where = '';
    if (user_id) {
      params.push(user_id);
      where = `WHERE ph.user_id = $${params.length}`;
    }
    params.push(parseInt(limit, 10), parseInt(offset, 10));
    const [rows, countRow] = await Promise.all([
      pool.query(
        `SELECT ph.id, ph.user_id, u.username, ph.amount, ph.reason, ph.created_at
         FROM point_history ph
         JOIN users u ON ph.user_id = u.id
         ${where}
         ORDER BY ph.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ),
      pool.query(
        `SELECT COUNT(*) FROM point_history ph ${where}`,
        user_id ? [user_id] : []
      )
    ]);
    res.json({ rows: rows.rows, total: parseInt(countRow.rows[0].count, 10) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 全スコア一覧（管理用）
router.get('/scores', async (req, res) => {
  const { event_id, status } = req.query;
  try {
    let query = `SELECT s.*, u.username, e.event_number, e.name AS event_name
                 FROM scores s
                 JOIN users u ON s.user_id = u.id
                 JOIN events e ON s.event_id = e.id
                 WHERE 1=1`;
    const params = [];
    if (event_id) { params.push(event_id); query += ` AND s.event_id = $${params.length}`; }
    if (status) { params.push(status); query += ` AND s.status = $${params.length}`; }
    query += ' ORDER BY s.updated_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ===== フレーム管理 =====
const FRAME_CLASSES = ['frame-gold','frame-silver','frame-neon-blue','frame-neon-pink','frame-fire','frame-rainbow'];

router.get('/frames', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM frames ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.get('/frames/classes', (req, res) => {
  res.json(FRAME_CLASSES);
});

router.post('/frames', async (req, res) => {
  const { name, description, point_cost, css_class } = req.body;
  if (!name || !point_cost || !css_class) return res.status(400).json({ error: '必須項目が不足しています' });
  try {
    const result = await pool.query(
      'INSERT INTO frames (name, description, point_cost, css_class) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, description || null, point_cost, css_class]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.patch('/frames/:id/visibility', async (req, res) => {
  const { is_active } = req.body;
  try {
    await pool.query('UPDATE frames SET is_active=$1 WHERE id=$2', [is_active, req.params.id]);
    res.json({ message: is_active ? 'ショップに表示しました' : 'ショップから非表示にしました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.delete('/frames/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE users SET equipped_frame_id=NULL WHERE equipped_frame_id=$1', [req.params.id]);
    await client.query('DELETE FROM user_frames WHERE frame_id=$1', [req.params.id]);
    await client.query('DELETE FROM frames WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ message: '削除しました' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// ===== 順位ポイント設定 =====
router.get('/settings/rank-pts', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('rank_pts_1','rank_pts_2','rank_pts_3','rank_pts_4','rank_pts_5','rank_pts_6','rank_pts_7','rank_pts_8','rank_pts_9','rank_pts_10','rank_pts_11_15','rank_pts_16_20','rank_pts_21_25','rank_pts_26_30','rank_pts_31plus')"
    );
    const map = {};
    result.rows.forEach(r => { map[r.key] = parseInt(r.value); });
    res.json({
      rank_pts_1:      map.rank_pts_1      ?? 100,
      rank_pts_2:      map.rank_pts_2      ?? 95,
      rank_pts_3:      map.rank_pts_3      ?? 95,
      rank_pts_4:      map.rank_pts_4      ?? 90,
      rank_pts_5:      map.rank_pts_5      ?? 90,
      rank_pts_6:      map.rank_pts_6      ?? 80,
      rank_pts_7:      map.rank_pts_7      ?? 80,
      rank_pts_8:      map.rank_pts_8      ?? 80,
      rank_pts_9:      map.rank_pts_9      ?? 80,
      rank_pts_10:     map.rank_pts_10     ?? 80,
      rank_pts_11_15:  map.rank_pts_11_15  ?? 60,
      rank_pts_16_20:  map.rank_pts_16_20  ?? 50,
      rank_pts_21_25:  map.rank_pts_21_25  ?? 30,
      rank_pts_26_30:  map.rank_pts_26_30  ?? 20,
      rank_pts_31plus: map.rank_pts_31plus ?? 10
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.put('/settings/rank-pts', async (req, res) => {
  const keys = ['rank_pts_1','rank_pts_2','rank_pts_3','rank_pts_4','rank_pts_5','rank_pts_6','rank_pts_7','rank_pts_8','rank_pts_9','rank_pts_10','rank_pts_11_15','rank_pts_16_20','rank_pts_21_25','rank_pts_26_30','rank_pts_31plus'];
  try {
    for (const key of keys) {
      if (req.body[key] !== undefined) {
        await pool.query(
          'INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2',
          [key, String(parseInt(req.body[key]) || 0)]
        );
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ===== ガチャアイコン管理 =====
router.get('/gacha/icons', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM gacha_icons ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.post('/gacha/icons', async (req, res) => {
  const { name, rarity, image_base64 } = req.body;
  if (!name || !rarity || !image_base64)
    return res.status(400).json({ error: '必須項目が不足しています' });
  if (!['SS', 'S', 'A'].includes(rarity))
    return res.status(400).json({ error: '無効なレアリティです' });
  try {
    const uploadResult = await cloudinary.uploader.upload(image_base64, {
      folder: 'hbr-ranking/gacha-icons',
      resource_type: 'image'
    });
    const result = await pool.query(
      'INSERT INTO gacha_icons (name, rarity, image_url) VALUES ($1,$2,$3) RETURNING *',
      [name, rarity, uploadResult.secure_url]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.patch('/gacha/icons/:id/unit', async (req, res) => {
  const { unit } = req.body;
  const VALID_UNITS = ['31A','31B','31C','31D','31E','31F','30G','31X',null,''];
  if (!VALID_UNITS.includes(unit)) return res.status(400).json({ error: '無効な部隊です' });
  try {
    await pool.query('UPDATE gacha_icons SET unit=$1 WHERE id=$2', [unit || null, req.params.id]);
    res.json({ message: '部隊を更新しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.patch('/gacha/icons/:id/visibility', async (req, res) => {
  const { is_active } = req.body;
  try {
    await pool.query('UPDATE gacha_icons SET is_active=$1 WHERE id=$2', [is_active, req.params.id]);
    res.json({ message: is_active ? 'ガチャに表示しました' : 'ガチャから非表示にしました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.delete('/gacha/icons/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE users SET equipped_icon_id=NULL WHERE equipped_icon_id=$1', [req.params.id]);
    await client.query('DELETE FROM user_icons WHERE icon_id=$1', [req.params.id]);
    await client.query('DELETE FROM gacha_icons WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ message: '削除しました' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

router.get('/gacha/settings', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('gacha_ss_rate','gacha_s_rate','gacha_a_rate','gacha_single_cost','gacha_multi_cost','gacha_show_nav','gacha_dup_ss_pts','gacha_dup_s_pts','gacha_dup_a_pts')"
    );
    const map = {};
    result.rows.forEach(r => { map[r.key] = r.value; });
    res.json({
      ss_rate: map.gacha_ss_rate || '3',
      s_rate: map.gacha_s_rate || '15',
      a_rate: map.gacha_a_rate || '82',
      single_cost: map.gacha_single_cost || '50',
      multi_cost: map.gacha_multi_cost || '450',
      show_nav: map.gacha_show_nav === 'true',
      dup_ss_pts: map.gacha_dup_ss_pts || '30',
      dup_s_pts: map.gacha_dup_s_pts || '10',
      dup_a_pts: map.gacha_dup_a_pts || '3'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.put('/gacha/settings', async (req, res) => {
  const { ss_rate, s_rate, a_rate, single_cost, multi_cost, show_nav, dup_ss_pts, dup_s_pts, dup_a_pts } = req.body;
  try {
    const updates = {
      gacha_ss_rate: ss_rate, gacha_s_rate: s_rate, gacha_a_rate: a_rate,
      gacha_single_cost: single_cost, gacha_multi_cost: multi_cost,
      gacha_show_nav: show_nav !== undefined ? String(show_nav) : undefined,
      gacha_dup_ss_pts: dup_ss_pts, gacha_dup_s_pts: dup_s_pts, gacha_dup_a_pts: dup_a_pts
    };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        await pool.query(
          'INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2',
          [key, String(value)]
        );
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ===== ガチャプール管理 =====
router.get('/gacha/pools/stats', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT gp.id, gp.name,
              COUNT(CASE WHEN l.pull_type='single' THEN 1 END)::int AS single_count,
              COUNT(CASE WHEN l.pull_type='multi'  THEN 1 END)::int AS multi_count,
              (COUNT(CASE WHEN l.pull_type='single' THEN 1 END) +
               COUNT(CASE WHEN l.pull_type='multi'  THEN 1 END) * 10)::int AS total_pulls
       FROM gacha_pools gp
       LEFT JOIN gacha_pull_logs l ON l.pool_id = gp.id
       GROUP BY gp.id, gp.name
       ORDER BY gp.order_index ASC, gp.id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.get('/gacha/pools', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT gp.id, gp.name, gp.description, gp.image_url, gp.is_active, gp.order_index, gp.created_at,
              gp.start_at, gp.end_at, gp.side,
              COUNT(gpi.icon_id)::int AS icon_count
       FROM gacha_pools gp
       LEFT JOIN gacha_pool_icons gpi ON gp.id = gpi.pool_id
       GROUP BY gp.id
       ORDER BY gp.order_index ASC, gp.id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.post('/gacha/pools', async (req, res) => {
  const { name, description, order_index, start_at, end_at, side } = req.body;
  if (!name) return res.status(400).json({ error: 'ガチャ名を入力してください' });
  try {
    const result = await pool.query(
      'INSERT INTO gacha_pools (name, description, order_index, start_at, end_at, side) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [name, description || null, parseInt(order_index) || 0, start_at || null, end_at || null, side === '裏' ? '裏' : '表']
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.patch('/gacha/pools/:id/image', async (req, res) => {
  const { image_base64 } = req.body;
  if (!image_base64) return res.status(400).json({ error: '画像データが必要です' });
  try {
    const up = await cloudinary.uploader.upload(image_base64, { folder: 'hbr-ranking/gacha-pools', resource_type: 'image' });
    await pool.query('UPDATE gacha_pools SET image_url=$1 WHERE id=$2', [up.secure_url, req.params.id]);
    res.json({ image_url: up.secure_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.put('/gacha/pools/:id', async (req, res) => {
  const { name, description, is_active, order_index, start_at, end_at, side } = req.body;
  if (!name) return res.status(400).json({ error: 'ガチャ名を入力してください' });
  try {
    const result = await pool.query(
      'UPDATE gacha_pools SET name=$1, description=$2, is_active=$3, order_index=$4, start_at=$5, end_at=$6, side=$7 WHERE id=$8 RETURNING *',
      [name, description || null, is_active !== false, parseInt(order_index) || 0, start_at || null, end_at || null, side === '裏' ? '裏' : '表', req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: '見つかりません' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// プール期間のみ更新
router.patch('/gacha/pools/:id/period', async (req, res) => {
  const { start_at, end_at } = req.body;
  try {
    await pool.query(
      'UPDATE gacha_pools SET start_at=$1, end_at=$2 WHERE id=$3',
      [start_at || null, end_at || null, req.params.id]
    );
    res.json({ message: '期間を更新しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.delete('/gacha/pools/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM gacha_pools WHERE id=$1', [req.params.id]);
    res.json({ message: '削除しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// プール内アイコン一覧
router.get('/gacha/pools/:id/icons', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT gi.id FROM gacha_pool_icons gpi
       JOIN gacha_icons gi ON gi.id = gpi.icon_id
       WHERE gpi.pool_id = $1`,
      [req.params.id]
    );
    res.json(result.rows.map(r => r.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// プール内アイコン一括更新（icon_ids で全置換）
router.put('/gacha/pools/:id/icons', async (req, res) => {
  const { icon_ids } = req.body;
  if (!Array.isArray(icon_ids)) return res.status(400).json({ error: 'icon_ids が必要です' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM gacha_pool_icons WHERE pool_id=$1', [req.params.id]);
    for (const iconId of icon_ids) {
      await client.query(
        'INSERT INTO gacha_pool_icons (pool_id, icon_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [req.params.id, iconId]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'アイコン設定を更新しました' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// プールのピックアップアイコン取得
router.get('/gacha/pools/:id/pickups', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT icon_id FROM gacha_pool_pickups WHERE pool_id=$1',
      [req.params.id]
    );
    res.json(result.rows.map(r => r.icon_id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// プールのピックアップアイコン一括更新
router.put('/gacha/pools/:id/pickups', async (req, res) => {
  const { icon_ids } = req.body;
  if (!Array.isArray(icon_ids)) return res.status(400).json({ error: 'icon_ids が必要です' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM gacha_pool_pickups WHERE pool_id=$1', [req.params.id]);
    for (const iconId of icon_ids) {
      await client.query(
        'INSERT INTO gacha_pool_pickups (pool_id, icon_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [req.params.id, iconId]
      );
    }
    await client.query('COMMIT');
    res.json({ message: 'ピックアップ設定を更新しました' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// ===== ログインボーナス設定 =====
router.get('/login-bonus-settings', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT key, value FROM settings WHERE key LIKE 'login_bonus_day%' ORDER BY key"
    );
    const pts = { day1:1, day2:1, day3:1, day4:1, day5:1, day6:1, day7:4 };
    result.rows.forEach(r => { pts[r.key.replace('login_bonus_', '')] = parseInt(r.value); });
    res.json(pts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.put('/login-bonus-settings', async (req, res) => {
  const days = ['day1','day2','day3','day4','day5','day6','day7'];
  try {
    for (const d of days) {
      const v = parseInt(req.body[d]);
      if (isNaN(v) || v < 0) return res.status(400).json({ error: '無効な値です' });
      await pool.query(
        "INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2",
        [`login_bonus_${d}`, String(v)]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ===== 特別ログインボーナス =====
router.get('/special-bonuses', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM special_login_bonuses ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.post('/special-bonuses', async (req, res) => {
  const { title, start_date, end_date, max_claims, points_per_claim } = req.body;
  if (!title || !start_date || !end_date || !max_claims || !points_per_claim)
    return res.status(400).json({ error: '全項目を入力してください' });
  try {
    const result = await pool.query(
      'INSERT INTO special_login_bonuses (title, start_date, end_date, max_claims, points_per_claim) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [title, start_date, end_date, parseInt(max_claims), parseInt(points_per_claim)]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.put('/special-bonuses/:id', async (req, res) => {
  const { title, start_date, end_date, max_claims, points_per_claim, is_active } = req.body;
  try {
    const result = await pool.query(
      'UPDATE special_login_bonuses SET title=$1, start_date=$2, end_date=$3, max_claims=$4, points_per_claim=$5, is_active=$6 WHERE id=$7 RETURNING *',
      [title, start_date, end_date, parseInt(max_claims), parseInt(points_per_claim), is_active, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: '見つかりません' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.delete('/special-bonuses/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM special_login_bonuses WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
