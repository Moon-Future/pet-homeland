const cloud = require('wx-server-sdk')
const qiniu = require('qiniu')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

const BUCKET = 'cl8023'
const KEY_PREFIX = 'project/star-pet-village/uploads'

const SUPPORTED_TYPES = new Set(['avatar', 'petCover', 'petAlbum', 'memory'])

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

  const uid = await resolveUid(openid)
  if (!uid) {
    return { ok: false, message: '用户尚未登录或缺少 uid' }
  }

  const subPath = buildSubPath(type, event.petSpaceId)
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.jpg`
  const key = `${KEY_PREFIX}/users/${uid}/${subPath}/${filename}`

  try {
    const uploadToken = signUploadToken(key)
    return { ok: true, uploadToken, key }
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
    fsizeLimit: 10 * 1024 * 1024,
    mimeLimit: 'image/*',
  })
  return putPolicy.uploadToken(mac)
}

async function resolveUid(openid) {
  try {
    const result = await db.collection('users')
      .where({ openid, status: _.neq('deleted') })
      .limit(1)
      .get()
    const user = (result.data || [])[0]
    return (user && user.uid) || ''
  } catch (error) {
    return ''
  }
}

function sanitizeType(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return SUPPORTED_TYPES.has(value) ? value : ''
}

function buildSubPath(type, petSpaceId) {
  const safePetSpaceId = sanitizePathPart(petSpaceId)

  if (type === 'avatar') {
    return 'avatars'
  }

  if (type === 'petCover') {
    return safePetSpaceId
      ? `pet-spaces/${safePetSpaceId}/covers`
      : 'pet-spaces/pending/covers'
  }

  if (type === 'petAlbum') {
    return safePetSpaceId
      ? `pet-spaces/${safePetSpaceId}/albums`
      : 'pet-spaces/pending/albums'
  }

  // memory
  return safePetSpaceId
    ? `pet-spaces/${safePetSpaceId}/memories`
    : 'pet-spaces/pending/memories'
}

function sanitizePathPart(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)
}
