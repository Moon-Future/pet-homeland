const cloud = require('wx-server-sdk')
const grant = require('./grant')
const storage = require('./storage')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const KEY_PREFIX = 'project/star-pet/uploads'

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext()

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态' }
  }

  let session = null
  try {
    session = grant.verifyGrant(event.sessionGrant)
  } catch (error) {
    return { ok: false, message: error.message || '登录态已失效' }
  }

  if (session.openid !== openid || !session.uid) {
    return { ok: false, message: '登录态不匹配' }
  }

  const refs = sanitizeRefs(event.refs)
  const allowedPrefix = `${KEY_PREFIX}/users/${session.uid}/`
  const allowedRefs = refs.filter((ref) => ref.key.startsWith(allowedPrefix))

  const deleted = await storage.deleteObjects(allowedRefs)

  return {
    ok: true,
    deleted,
  }
}

function sanitizeRefs(value) {
  if (!Array.isArray(value)) {
    return []
  }

  const dedup = new Map()
  value.forEach((ref) => {
    const safeRef = sanitizeRef(ref)
    if (safeRef && safeRef.key && !dedup.has(safeRef.key)) {
      dedup.set(safeRef.key, safeRef)
    }
  })
  return [...dedup.values()]
}

function sanitizeRef(ref) {
  if (!ref || typeof ref !== 'object') {
    return null
  }

  const storageName = sanitizeString(ref.storage, 32)
  const bucket = sanitizeString(ref.bucket, 64)
  const key = sanitizeString(ref.key, 512)

  if (!storageName || !bucket || !key) {
    return null
  }

  return { storage: storageName, bucket, key }
}

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().slice(0, maxLength)
}
