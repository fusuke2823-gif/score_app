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
  if (username.length < 2 || username.length > 50)
    return res.status(400).json({ error: 'ユーザー名は2〜50文字で入力してください' });
  if (password.length < 6)
    return res.status(400).json({ error: 'パスワードは6文字以上で入力してください' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, oshi_character) VALUES ($1, $2, $3) RETURNING id, username, role, oshi_character',
      [username, hash, oshi_character || null]
    );
    const user = result.rows[0];
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
  const { oshi_character } = req.body;
  try {
    const result = await pool.query(
      'UPDATE users SET oshi_character = $1 WHERE id = $2 RETURNING id, username, role, oshi_character',
      [oshi_character, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

module.exports = router;
