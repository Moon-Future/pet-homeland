// Shared qiniu storage helpers for cloud functions (full version with delete).
// Sync source for all cloud function local copies.
// Edit this file, then run: node scripts/sync-shared.js

const qiniu = require('qiniu')

const BUCKET = 'cl8023'
const CDN_HOST = process.env.QINIU_CDN_HOST || 'https://qiniu.cdn.cl8023.com'
const KEY_PREFIX = 'project/star-pet'
const ZONE = qiniu.zone.Zone_z2 // 华南-广东

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

function buildBucketManager() {
  const mac = new qiniu.auth.digest.Mac(
    process.env.QINIU_ACCESS_KEY,
    process.env.QINIU_SECRET_KEY,
  )
  const cfg = new qiniu.conf.Config({ zone: ZONE })
  return new qiniu.rs.BucketManager(mac, cfg)
}

// refs: Array<Ref | string key>; tolerates either form.
async function deleteObjects(refs) {
  const valid = (refs || [])
    .map((item) => (typeof item === 'string' ? { storage: 'qiniu', bucket: BUCKET, key: item } : item))
    .filter((ref) => ref && ref.storage === 'qiniu' && ref.key)

  if (!valid.length) return

  const bm = buildBucketManager()

  for (let i = 0; i < valid.length; i += 500) {
    const slice = valid.slice(i, i + 500)
    const ops = slice.map((ref) => qiniu.rs.deleteOp(ref.bucket || BUCKET, ref.key))

    await new Promise((resolve) => {
      bm.batch(ops, () => resolve())
    })
  }
}

module.exports = {
  buildUrl,
  assetUrl,
  deleteObjects,
  BUCKET,
  CDN_HOST,
  KEY_PREFIX,
}