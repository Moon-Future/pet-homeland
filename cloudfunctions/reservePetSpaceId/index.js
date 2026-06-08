const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const grant = require('./grant')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const PET_UPLOAD_TTL_MS = 20 * 60 * 1000

// Returns a fresh pet_spaces _id without inserting any document. The client
// uses this id as the petSpaceId when uploading cover/album images before the
// pet space record exists, then passes it back as the explicit _id when
// calling createPetSpace — so all image keys live under the final pet space's
// prefix and no pending/ uploads stay orphaned.
//
// Format: 24 hex chars (mongodb ObjectId-shaped). Cloud DB allows any string
// _id; uniqueness is guaranteed by 96 random bits.
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

  const petSpaceId = crypto.randomBytes(12).toString('hex')
  const petUploadGrant = grant.signGrant({
    v: 1,
    uid: session.uid,
    petSpaceId,
    scope: ['petCover', 'petAlbum', 'memory'],
    exp: Date.now() + PET_UPLOAD_TTL_MS,
  })

  return { ok: true, petSpaceId, petUploadGrant }
}
