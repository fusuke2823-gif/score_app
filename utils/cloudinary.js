const TRANSFORM = 'q_auto,f_auto,w_1920,c_limit';

function optimizeUrl(url) {
  if (!url || !url.includes('res.cloudinary.com')) return url;
  return url.replace('/upload/', `/upload/${TRANSFORM}/`);
}

module.exports = { optimizeUrl };
