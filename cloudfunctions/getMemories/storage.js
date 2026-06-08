// AUTO-GENERATED — DO NOT EDIT.
// Edit cloudfunctions/_shared/<source>.js and run: node scripts/sync-shared.js

// Shared storage helper — lightweight (no qiniu SDK dependency).
// Sync source for read-side cloud functions.
// Edit this file, then run: node scripts/sync-shared.js

const CDN_HOST = process.env.QINIU_CDN_HOST || 'https://qiniu.cdn.cl8023.com'
const KEY_PREFIX = 'project/star-pet'

function buildUrl(refOrKey) {
  if (!refOrKey) return ''
  const key = typeof refOrKey === 'string' ? refOrKey : refOrKey.key
  return key ? `${CDN_HOST}/${key}` : ''
}

// Builds a CDN url for a static asset under {KEY_PREFIX}/assets/...
function assetUrl(relativePath) {
  if (!relativePath) return ''
  const clean = String(relativePath).replace(/^\/+/, '')
  return `${CDN_HOST}/${KEY_PREFIX}/assets/${clean}`
}

module.exports = {
  buildUrl,
  assetUrl,
  CDN_HOST,
  KEY_PREFIX,
}