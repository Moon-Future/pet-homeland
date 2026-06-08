// Lightweight URL builder for read-side cloud functions. No qiniu SDK needed
// because the public bucket lets us reconstruct a CDN url from any key.
const CDN_HOST = 'https://qiniu.cdn.cl8023.com'

function buildUrl(refOrKey) {
  if (!refOrKey) return ''
  const key = typeof refOrKey === 'string' ? refOrKey : refOrKey.key
  return key ? `${CDN_HOST}/${key}` : ''
}

module.exports = {
  buildUrl,
  CDN_HOST,
}
