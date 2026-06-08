const cloud = require('wx-server-sdk')
const storage = require('./storage')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

exports.main = async () => {
  const { OPENID: openid } = cloud.getWXContext()

  if (!openid) {
    return {
      ok: false,
      message: '无法获取微信登录态',
      petSpaces: [],
    }
  }

  try {
    const result = await db.collection('pet_spaces')
      .where({
        ownerOpenid: openid,
        status: _.neq('deleted'),
      })
      .orderBy('updatedAt', 'desc')
      .limit(20)
      .get()

    const petSpaces = result.data || []
    attachPetImageUrls(petSpaces)

    return {
      ok: true,
      petSpaces,
    }
  } catch (error) {
    if (isCollectionNotFound(error)) {
      return {
        ok: true,
        petSpaces: [],
      }
    }

    return {
      ok: false,
      message: error.message || error.errMsg || '读取宠物小窝失败',
      petSpaces: [],
    }
  }
}

function attachPetImageUrls(petSpaces) {
  petSpaces.forEach((item) => {
    item.avatarUrl = storage.buildUrl(item.avatarRef)
    item.coverUrl = storage.buildUrl(item.coverRef) || item.avatarUrl
  })
}

function isCollectionNotFound(error = {}) {
  const message = `${error.errCode || ''} ${error.errMsg || ''} ${error.message || ''}`
  return message.includes('-502005') || message.includes('collection not exist')
}
