const express = require('express');
const router = express.Router();
const pool = require('../db/index');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

async function uniqueCode() {
  for (let i = 0; i < 10; i++) {
    const code = generateCode();
    const r = await pool.query('SELECT id FROM charts WHERE chart_code=$1', [code]);
    if (!r.rows.length) return code;
  }
  throw new Error('Failed to generate unique chart code');
}

// ゲームデータ（キャラ・スタイル・技）
router.get('/game-data', async (req, res) => {
  try {
    const [chars, styles, skills] = await Promise.all([
      pool.query('SELECT id, name, abbreviation, sort_order, icon_url FROM chart_characters ORDER BY sort_order, name'),
      pool.query('SELECT id, character_id, name, abbreviation, has_special_skill FROM chart_styles ORDER BY id'),
      pool.query('SELECT id, character_id, name, abbreviation, has_target, style_id, is_special FROM chart_skills ORDER BY id'),
    ]);
    res.json({ characters: chars.rows, styles: styles.rows, skills: skills.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ODのゲージ数は1〜5、何ターン目かはゲージ数（3以上は3）まで
function invalidTurns(turns) {
  return (turns || []).some(t => (t.turn_type === 'od_pre' || t.turn_type === 'od_post') &&
    !(Number.isInteger(t.od_total) && t.od_total >= 1 && t.od_total <= 5 &&
      Number.isInteger(t.od_index) && t.od_index >= 1 && t.od_index <= Math.min(t.od_total, 3)));
}

// チャート一覧
router.get('/', optionalAuth, async (req, res) => {
  const { event_id, attribute, user_id, code, username, q } = req.query;
  try {
    const conditions = [];
    const params = [];
    if (event_id) { params.push(event_id); conditions.push(`c.event_id = $${params.length}`); }
    if (attribute) { params.push(attribute); conditions.push(`c.attribute = $${params.length}`); }
    if (user_id) { params.push(user_id); conditions.push(`c.user_id = $${params.length}`); }
    // 下書きは自分のチャート一覧（user_id が自分）のときだけ含める
    if (!(user_id && req.user && String(req.user.id) === String(user_id))) conditions.push('c.is_public');
    if (code) { params.push(code.toUpperCase()); conditions.push(`c.chart_code = $${params.length}`); }
    if (username) { params.push(`%${username}%`); conditions.push(`u.username ILIKE $${params.length}`); }
    // q：チャートID・タイトル・ユーザー名のどれかに当たれば出す
    if (q && q.trim()) {
      params.push(q.trim().toUpperCase()); const ci = params.length;
      params.push(`%${q.trim()}%`); const li = params.length;
      conditions.push(`(c.chart_code = $${ci} OR c.title ILIKE $${li} OR u.username ILIKE $${li})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT c.id, c.user_id, u.username, c.event_id, e.name AS event_name, e.event_number,
              c.attribute, c.title, c.description, c.chart_code, c.is_public, c.created_at, c.updated_at,
              (SELECT COUNT(*)::int FROM chart_turns ct WHERE ct.chart_id = c.id) AS turn_count,
              (SELECT json_agg(json_build_object('slot', cm.slot, 'name', cc.name, 'abbreviation', cc.abbreviation,
                        'icon_url', cc.icon_url, 'style', COALESCE(cs.abbreviation, cs.name), 'refine_count', cm.refine_count) ORDER BY cm.slot)
                 FROM chart_members cm
                 JOIN chart_characters cc ON cc.id = cm.character_id
                 JOIN chart_styles cs ON cs.id = cm.style_id
                WHERE cm.chart_id = c.id) AS members
       FROM charts c
       JOIN users u ON u.id = c.user_id
       JOIN events e ON e.id = c.event_id
       ${where}
       ORDER BY e.event_number DESC, c.created_at DESC
       LIMIT 200`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// チャート詳細
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const chartRes = await pool.query(
      `SELECT c.*, u.username, e.name AS event_name, e.event_number
       FROM charts c
       JOIN users u ON u.id = c.user_id
       JOIN events e ON e.id = c.event_id
       WHERE c.id = $1`,
      [req.params.id]
    );
    const chart = chartRes.rows[0];
    if (!chart || (!chart.is_public && chart.user_id !== req.user?.id)) return res.status(404).json({ error: 'チャートが見つかりません' });

    const [members, turns, actions] = await Promise.all([
      pool.query(
        `SELECT cm.slot, cm.character_id, cm.style_id, cm.refine_count,
                cc.name AS character_name, cc.abbreviation AS character_abbreviation, cc.icon_url AS character_icon_url, cs.name AS style_name, cs.abbreviation AS style_abbreviation, cs.has_special_skill
         FROM chart_members cm
         JOIN chart_characters cc ON cc.id = cm.character_id
         JOIN chart_styles cs ON cs.id = cm.style_id
         WHERE cm.chart_id = $1 ORDER BY cm.slot`,
        [chart.id]
      ),
      pool.query(
        `SELECT id, seq_order, turn_type, od_index, od_total, note
         FROM chart_turns WHERE chart_id = $1 ORDER BY seq_order`,
        [chart.id]
      ),
      pool.query(
        `SELECT ca.chart_turn_id, ca.member_slot, ca.skill_id, ca.target_slot, ca.order_num,
                sk.name AS skill_name, sk.abbreviation, sk.has_target, sk.is_special,
                CASE WHEN sk.is_special THEN 'special' WHEN sk.style_id IS NOT NULL THEN 'style' WHEN sk.character_id IS NOT NULL THEN 'char' ELSE 'global' END AS skill_type
         FROM chart_actions ca
         JOIN chart_skills sk ON sk.id = ca.skill_id
         JOIN chart_turns ct ON ct.id = ca.chart_turn_id
         WHERE ct.chart_id = $1`,
        [chart.id]
      ),
    ]);

    const actionsByTurn = {};
    for (const a of actions.rows) {
      if (!actionsByTurn[a.chart_turn_id]) actionsByTurn[a.chart_turn_id] = [];
      actionsByTurn[a.chart_turn_id].push(a);
    }

    res.json({
      ...chart,
      members: members.rows,
      turns: turns.rows.map(t => ({ ...t, actions: actionsByTurn[t.id] || [] })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// チャート作成
router.post('/', authenticateToken, async (req, res) => {
  const { event_id, attribute, title, description, members, turns, is_public } = req.body;
  if (!event_id || !attribute || !title) return res.status(400).json({ error: '必須項目が不足しています' });
  if (!members?.length) return res.status(400).json({ error: 'メンバーを設定してください' });
  if (invalidTurns(turns)) return res.status(400).json({ error: 'ODの設定が正しくありません' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const code = await uniqueCode();
    const chartRes = await client.query(
      `INSERT INTO charts (user_id, event_id, attribute, title, description, chart_code, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [req.user.id, event_id, attribute, title.trim(), description?.trim() || null, code, is_public === true]
    );
    const chartId = chartRes.rows[0].id;

    for (const m of members) {
      if (!m.character_id || !m.style_id) continue;
      await client.query(
        `INSERT INTO chart_members (chart_id, slot, character_id, style_id, refine_count)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (chart_id, slot) DO UPDATE
         SET character_id=$3, style_id=$4, refine_count=$5`,
        [chartId, m.slot, m.character_id, m.style_id, m.refine_count ?? 0]
      );
    }

    for (const t of (turns || [])) {
      const turnRes = await client.query(
        `INSERT INTO chart_turns (chart_id, seq_order, turn_type, od_index, od_total, note)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [chartId, t.seq_order, t.turn_type, t.od_index ?? null, t.od_total ?? null, t.note?.trim() || null]
      );
      const turnId = turnRes.rows[0].id;
      for (const a of (t.actions || [])) {
        if (!a.skill_id) continue;
        await client.query(
          `INSERT INTO chart_actions (chart_turn_id, member_slot, skill_id, target_slot, order_num)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (chart_turn_id, member_slot) DO NOTHING`,
          [turnId, a.member_slot, a.skill_id, a.target_slot ?? null, a.order_num ?? null]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'チャートを保存しました', id: chartId, chart_code: code });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// チャート更新
router.put('/:id', authenticateToken, async (req, res) => {
  const { event_id, attribute, title, description, members, turns, is_public } = req.body;
  if (!title) return res.status(400).json({ error: 'タイトルは必須です' });
  if (invalidTurns(turns)) return res.status(400).json({ error: 'ODの設定が正しくありません' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id, user_id FROM charts WHERE id=$1', [req.params.id]);
    if (!existing.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: '見つかりません' }); }
    if (existing.rows[0].user_id !== req.user.id) { await client.query('ROLLBACK'); return res.status(403).json({ error: '権限がありません' }); }

    await client.query(
      `UPDATE charts SET event_id=$1, attribute=$2, title=$3, description=$4, is_public=$5, updated_at=NOW() WHERE id=$6`,
      [event_id, attribute, title.trim(), description?.trim() || null, is_public === true, req.params.id]
    );

    await client.query('DELETE FROM chart_members WHERE chart_id=$1', [req.params.id]);
    for (const m of (members || [])) {
      if (!m.character_id || !m.style_id) continue;
      await client.query(
        `INSERT INTO chart_members (chart_id, slot, character_id, style_id, refine_count)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.params.id, m.slot, m.character_id, m.style_id, m.refine_count ?? 0]
      );
    }

    await client.query('DELETE FROM chart_turns WHERE chart_id=$1', [req.params.id]);
    for (const t of (turns || [])) {
      const turnRes = await client.query(
        `INSERT INTO chart_turns (chart_id, seq_order, turn_type, od_index, od_total, note)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [req.params.id, t.seq_order, t.turn_type, t.od_index ?? null, t.od_total ?? null, t.note?.trim() || null]
      );
      const turnId = turnRes.rows[0].id;
      for (const a of (t.actions || [])) {
        if (!a.skill_id) continue;
        await client.query(
          `INSERT INTO chart_actions (chart_turn_id, member_slot, skill_id, target_slot, order_num)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT (chart_turn_id, member_slot) DO NOTHING`,
          [turnId, a.member_slot, a.skill_id, a.target_slot ?? null, a.order_num ?? null]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'チャートを更新しました' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  } finally {
    client.release();
  }
});

// チャート削除
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM charts WHERE id=$1 AND user_id=$2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: '見つかりません' });
    res.json({ message: '削除しました' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
