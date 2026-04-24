const TRANSFORM = 'q_auto,f_auto,w_1080,c_limit';

function optimizeUrl(url) {
  if (!url || !url.includes('res.cloudinary.com')) return url;
  return url.replace('/upload/', `/upload/${TRANSFORM}/`);
}

let _usageCache = null;
let _usageCacheAt = 0;
const USAGE_TTL = 30 * 60 * 1000;

async function fetchUsage() {
  const now = Date.now();
  if (_usageCache && now - _usageCacheAt < USAGE_TTL) return _usageCache;
  const cloudinary = require('cloudinary').v2;
  _usageCache = await cloudinary.api.usage();
  _usageCacheAt = now;
  return _usageCache;
}

module.exports = { optimizeUrl, fetchUsage };
