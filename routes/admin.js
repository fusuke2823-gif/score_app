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
    const result = await pool.query("SELECT value FROM settings WHERE key = 'notify_on_submit'");
    const enabled = result.rows.length > 0 && result.rows[0].value === 'true';
    res.json({ notify_on_submit: enabled });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// 通知設定更新
router.put('/settings', async (req, res) => {
  const { notify_on_submit } = req.body;
  try {
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ('notify_on_submit', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
      [notify_on_submit ? 'true' : 'false']
    );
    res.json({ notify_on_submit: !!notify_on_submit });
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

module.exports = router;
