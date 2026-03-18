const nodemailer = require('nodemailer');
const pool = require('../db/index');

const transporter = nodemailer.createTransport({
  host: '74.125.24.108',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  },
  tls: { servername: 'smtp.gmail.com' }
});

async function isNotifyEnabled() {
  try {
    const result = await pool.query("SELECT value FROM settings WHERE key = 'notify_on_submit'");
    return result.rows.length > 0 && result.rows[0].value === 'true';
  } catch {
    return false;
  }
}

async function sendScoreNotification({ username, eventName, attribute, score }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !process.env.ADMIN_NOTIFY_EMAIL) return;
  if (!(await isNotifyEnabled())) return;

  try {
    await transporter.sendMail({
      from: `"HBR ランキング" <${process.env.GMAIL_USER}>`,
      to: process.env.ADMIN_NOTIFY_EMAIL,
      subject: `【HBR】スコア投稿 - ${username}`,
      text: [
        '新しいスコアが投稿されました。',
        '',
        `ユーザー: ${username}`,
        `イベント: ${eventName}`,
        `属性: ${attribute}`,
        `スコア: ${Number(score).toLocaleString()}`,
        '',
        '管理画面で確認・承認してください。'
      ].join('\n')
    });
  } catch (err) {
    console.error('メール送信エラー:', err.message);
  }
}

module.exports = { sendScoreNotification, isNotifyEnabled };
