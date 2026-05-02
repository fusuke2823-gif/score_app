const TRANSFORM = 'q_auto,f_auto,w_800,c_limit';
const THUMB_TRANSFORM = 'q_60,f_auto,w_300,c_limit';

function optimizeUrl(url) {
  if (!url || !url.includes('res.cloudinary.com')) return url;
  return url.replace('/upload/', `/upload/${TRANSFORM}/`);
}

let _usageCache = null;
let _usageCacheAt = 0;
const USAGE_TTL = 30 * 60 * 1000;

async function fetchUsage(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _usageCache && now - _usageCacheAt < USAGE_TTL) return _usageCache;
  const cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  const data = await cloudinary.api.usage();
  // used_percent が未設定の場合は計算
  ['bandwidth', 'storage', 'transformations'].forEach(k => {
    if (data[k] && data[k].used_percent == null && data[k].limit) {
      data[k].used_percent = (data[k].usage / data[k].limit) * 100;
    }
  });
  _usageCache = data;
  _usageCacheAt = now;
  return _usageCache;
}

module.exports = { optimizeUrl, fetchUsage };
