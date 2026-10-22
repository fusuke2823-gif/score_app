// 回数制限などで使う「利用者のIP」を求める。
// 本番は 利用者 → Cloudflare → Render の中継 → このサーバー の順に届くので、req.ip は Render の中継のIPになる。
// X-Forwarded-For は「利用者, Cloudflare」の形で、最後の値は Render が付けた「実際につないできた相手」。
// その相手が Cloudflare のときだけ、Cloudflare が付ける CF-Connecting-IP（利用者のIP）を信じる。
// Cloudflare を通らずに Render の直通アドレスへ来たときは CF-Connecting-IP を偽れるので、つないできた相手のIPを使う。
const net = require('net');
const { ipKeyGenerator } = require('express-rate-limit');

// Cloudflare の公開しているIPの範囲（https://www.cloudflare.com/ips/）
const CLOUDFLARE = new net.BlockList();
[
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
].forEach(c => { const [a, p] = c.split('/'); CLOUDFLARE.addSubnet(a, +p, 'ipv4'); });
['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32']
  .forEach(c => { const [a, p] = c.split('/'); CLOUDFLARE.addSubnet(a, +p, 'ipv6'); });

function isCloudflare(ip) {
  const type = net.isIP(ip);
  return type !== 0 && CLOUDFLARE.check(ip, type === 6 ? 'ipv6' : 'ipv4');
}

function clientIp(req) {
  const hops = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  const peer = hops[hops.length - 1];
  const cf = String(req.headers['cf-connecting-ip'] || '').trim();
  if (peer && isCloudflare(peer) && net.isIP(cf)) return cf;
  if (peer && net.isIP(peer)) return peer;
  return req.ip;
}

// express-rate-limit 用の数え方（IPv6 は同じ回線をまとめて数える）
function rateLimitKey(req) {
  return ipKeyGenerator(clientIp(req));
}

module.exports = { clientIp, rateLimitKey };
