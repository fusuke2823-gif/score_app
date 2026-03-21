const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/index');
const { authenticateToken } = require('../middleware/auth');

router.post('/register', async (req, res) => {
  const { username, password, oshi_character } = req.body;

  if (!username || !password)
    return res.status(400).json({ error: 'ユーザー名とパスワードは必須です' });
  if (username.length < 1 || username.length > 12)
    return res.status(400).json({ error: 'ユーザー名は1〜12文字で入力してください' });
  if (password.length < 6)
    return res.status(400).json({ error: 'パスワードは6文字以上で入力してください' });

  try {
    const existing = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0)
      return res.status(409).json({ error: 'このユーザー名は既に使用されています' });
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, oshi_character) VALUES ($1, $2, $3) RETURNING id, username, role, oshi_character',
      [username, hash, oshi_character || null]
    );
    const user = result.rows[0];
    await pool.query('UPDATE users SET points = 50 WHERE id = $1', [user.id]);
    await pool.query('INSERT INTO point_history (user_id, amount, reason) VALUES ($1, 50, $2)', [user.id, '新規登録ボーナス']);
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'このユーザー名は既に使用されています' });
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'ユーザー名またはパスワードが間違っています' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, oshi_character: user.oshi_character }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, role, oshi_character, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

router.put('/me', authenticateToken, async (req, res) => {
  const { username, oshi_character, current_password, new_password } = req.body;

  if (username !== undefined) {
    if (username.length < 1 || username.length > 12)
      return res.status(400).json({ error: 'ユーザー名は1〜12文字で入力してください' });
  }

  try {
    if (username) {
      const existing = await pool.query('SELECT 1 FROM users WHERE username = $1 AND id != $2', [username, req.user.id]);
      if (existing.rows.length > 0)
        return res.status(409).json({ error: 'このユーザー名は既に使用されています' });
    }
    // パスワード変更がある場合は現在のパスワードを確認
    if (new_password) {
      if (new_password.length < 6)
        return res.status(400).json({ error: '新しいパスワードは6文字以上で入力してください' });
      if (!current_password)
        return res.status(400).json({ error: '現在のパスワードを入力してください' });
      const userRow = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      const ok = await bcrypt.compare(current_password, userRow.rows[0].password_hash);
      if (!ok) return res.status(401).json({ error: '現在のパスワードが間違っています' });
    }

    let result;
    if (new_password) {
      const hash = await bcrypt.hash(new_password, 10);
      result = await pool.query(
        'UPDATE users SET username=COALESCE($1,username), oshi_character=$2, password_hash=$3 WHERE id=$4 RETURNING id, username, role, oshi_character',
        [username || null, oshi_character ?? null, hash, req.user.id]
      );
    } else {
      result = await pool.query(
        'UPDATE users SET username=COALESCE($1,username), oshi_character=$2 WHERE id=$3 RETURNING id, username, role, oshi_character',
        [username || null, oshi_character ?? null, req.user.id]
      );
    }

    const updated = result.rows[0];
    // JWTのusernameも更新
    const token = require('jsonwebtoken').sign(
      { id: updated.id, username: updated.username, role: updated.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ user: updated, token });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'このユーザー名は既に使用されています' });
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ログインボーナス状態確認
router.get('/login-bonus', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT last_login_date, login_streak FROM users WHERE id=$1', [req.user.id]
    );
    const { last_login_date, login_streak } = result.rows[0];
    const today = new Date().toISOString().slice(0, 10);
    const lastDate = last_login_date ? last_login_date.toISOString().slice(0, 10) : null;
    res.json({ already_claimed: lastDate === today, streak: login_streak || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// ログインボーナス受け取り
router.post('/login-bonus', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT last_login_date, login_streak FROM users WHERE id=$1', [req.user.id]
    );
    const { last_login_date, login_streak } = result.rows[0];
    const today = new Date().toISOString().slice(0, 10);
    const lastDate = last_login_date ? last_login_date.toISOString().slice(0, 10) : null;

    if (lastDate === today) return res.status(409).json({ error: '本日分はすでに受け取り済みです' });

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    let newStreak = lastDate === yesterdayStr ? (login_streak % 7) + 1 : 1;
    const points = newStreak === 7 ? 4 : 1;

    await pool.query(
      'UPDATE users SET last_login_date=$1, login_streak=$2, points=points+$3, total_login_days=total_login_days+1 WHERE id=$4',
      [today, newStreak, points, req.user.id]
    );
    await pool.query(
      'INSERT INTO point_history (user_id, amount, reason) VALUES ($1,$2,$3)',
      [req.user.id, points, `ログインボーナス ${newStreak}日目`]
    );
    res.json({ streak: newStreak, points_earned: points });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
