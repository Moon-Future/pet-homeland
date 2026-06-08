const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

// Returns a fresh pet_spaces _id without inserting any document. The client
// uses this id as the petSpaceId when uploading cover/album images before the
// pet space record exists, then passes it back as the explicit _id when
// calling createPetSpace — so all image keys live under the final pet space's
// prefix and no pending/ uploads stay orphaned.
//
// Format: 24 hex chars (mongodb ObjectId-shaped). Cloud DB allows any string
// _id; uniqueness is guaranteed by 96 random bits.
exports.main = async () => {
  const { OPENID: openid } = cloud.getWXContext()

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态' }
  }

  const petSpaceId = crypto.randomBytes(12).toString('hex')

  return { ok: true, petSpaceId }
}