const cloud = require('wx-server-sdk')
const grant = require('./grant')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()

const PET_UPLOAD_TTL_MS = 20 * 60 * 1000

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

  const petSpaceId = sanitizeString(event.petSpaceId, 64)
  if (!petSpaceId) {
    return { ok: false, message: '缺少宠物小窝ID' }
  }

  try {
    const current = await db.collection('pet_spaces').doc(petSpaceId).get()
    const petSpace = current.data

    if (!petSpace || petSpace.status === 'deleted') {
      return { ok: false, message: '小窝不存在' }
    }

    if (petSpace.ownerOpenid !== openid) {
      return { ok: false, message: '无权上传这个小窝的图片' }
    }

    const petUploadGrant = grant.signGrant({
      v: 1,
      uid: session.uid,
      petSpaceId,
      scope: ['petCover', 'petAlbum', 'memory'],
      exp: Date.now() + PET_UPLOAD_TTL_MS,
    })

    return {
      ok: true,
      petUploadGrant,
    }
  } catch (error) {
    return {
      ok: false,
      message: error.message || error.errMsg || '获取上传授权失败',
    }
  }
}

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().slice(0, maxLength)
}
