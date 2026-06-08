const cloud = require('wx-server-sdk')
const qiniu = require('qiniu')
const crypto = require('crypto')
const grant = require('./grant')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const BUCKET = 'cl8023'
const KEY_PREFIX = 'project/star-pet/uploads'

const SUPPORTED_TYPES = new Set(['avatar', 'petCover', 'petAlbum', 'memory'])
const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp'])

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext()

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态' }
  }

  if (!process.env.QINIU_ACCESS_KEY || !process.env.QINIU_SECRET_KEY) {
    return { ok: false, message: '七牛密钥未配置' }
  }

  const type = sanitizeType(event.type)
  if (!type) {
    return { ok: false, message: '不支持的图片类型' }
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

  const grantPayload = resolvePetUploadGrant(type, session.uid, event.petUploadGrant)
  if (!grantPayload.ok) {
    return grantPayload
  }

  const ext = sanitizeExt(event.ext)
  const subPath = buildSubPath(type, grantPayload.petSpaceId)
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`
  const key = `${KEY_PREFIX}/users/${session.uid}/${subPath}/${filename}`

  try {
    const uploadToken = signUploadToken(key)
    return {
      ok: true,
      uploadToken,
      key,
      ref: {
        storage: 'qiniu',
        bucket: BUCKET,
        key,
      },
      url: `${process.env.QINIU_CDN_HOST || 'https://qiniu.cdn.cl8023.com'}/${key}`,
    }
  } catch (error) {
    return {
      ok: false,
      message: error.message || error.errMsg || '生成上传凭证失败',
    }
  }
}

function signUploadToken(key) {
  const mac = new qiniu.auth.digest.Mac(
    process.env.QINIU_ACCESS_KEY,
    process.env.QINIU_SECRET_KEY,
  )
  const putPolicy = new qiniu.rs.PutPolicy({
    scope: `${BUCKET}:${key}`,
    expires: 3600,
    fsizeLimit: MAX_BYTES,
    mimeLimit: 'image/*',
  })
  return putPolicy.uploadToken(mac)
}

function sanitizeType(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return SUPPORTED_TYPES.has(value) ? value : ''
}

function buildSubPath(type, safePetSpaceId) {
  if (type === 'avatar') {
    return 'avatars'
  }

  if (type === 'petCover') {
    return `pet-spaces/${safePetSpaceId}/covers`
  }

  if (type === 'petAlbum') {
    return `pet-spaces/${safePetSpaceId}/albums`
  }

  // memory
  return `pet-spaces/${safePetSpaceId}/memories`
}

function resolvePetUploadGrant(type, uid, token) {
  if (type === 'avatar') {
    return { ok: true, petSpaceId: '' }
  }

  let payload = null
  try {
    payload = grant.verifyGrant(token)
  } catch (error) {
    return { ok: false, message: error.message || '上传授权已失效' }
  }

  if (payload.uid !== uid) {
    return { ok: false, message: '上传授权不匹配' }
  }

  const scope = Array.isArray(payload.scope) ? payload.scope : []
  if (!scope.includes(type)) {
    return { ok: false, message: '上传类型未授权' }
  }

  const petSpaceId = sanitizePathPart(payload.petSpaceId)
  if (!petSpaceId) {
    return { ok: false, message: '上传授权无效' }
  }

  return { ok: true, petSpaceId }
}

function sanitizePathPart(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)
}

function sanitizeExt(value) {
  if (typeof value !== 'string') {
    return 'jpg'
  }
  const ext = value.trim().toLowerCase()
  return ALLOWED_EXTS.has(ext) ? ext : 'jpg'
}
