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

  if (!valid.length) {
    return {
      successCount: 0,
      failCount: 0,
      failedKeys: [],
    }
  }

  const bm = buildBucketManager()
  const failedKeys = []
  let successCount = 0

  for (let i = 0; i < valid.length; i += 500) {
    const slice = valid.slice(i, i + 500)
    const ops = slice.map((ref) => qiniu.rs.deleteOp(ref.bucket || BUCKET, ref.key))

    // Qiniu batch returns per-item status codes; treat 200/612 as success.
    // 612 means "file not found", which is acceptable for idempotent cleanup.
    await new Promise((resolve) => {
      bm.batch(ops, (error, body) => {
        if (error) {
          console.error('[storage.deleteObjects] batch request failed', {
            message: error.message || error.errMsg || String(error),
            keys: slice.map((ref) => ref.key),
          })
          slice.forEach((ref) => failedKeys.push(ref.key))
          resolve()
          return
        }

        const items = Array.isArray(body) ? body : []
        slice.forEach((ref, index) => {
          const item = items[index] || {}
          const code = Number(item.code || 0)
          if (code === 200 || code === 612) {
            successCount += 1
            return
          }

          failedKeys.push(ref.key)
          console.error('[storage.deleteObjects] object delete failed', {
            key: ref.key,
            code,
            data: item.data || '',
          })
        })

        resolve()
      })
    })
  }

  return {
    successCount,
    failCount: failedKeys.length,
    failedKeys,
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
