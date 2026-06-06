const cloud = require('wx-server-sdk')

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
    await attachPetImageUrls(petSpaces)

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

async function attachPetImageUrls(petSpaces) {
  const fileIds = [...new Set(petSpaces.flatMap((item) => [item.avatarFileId, item.coverFileId]).filter(Boolean))]

  if (!fileIds.length) {
    return
  }

  const urlResult = await cloud.getTempFileURL({ fileList: fileIds }).catch(() => ({ fileList: [] }))
  const urlMap = (urlResult.fileList || []).reduce((map, item) => {
    if (item.fileID && item.tempFileURL) {
      map[item.fileID] = item.tempFileURL
    }
    return map
  }, {})

  petSpaces.forEach((item) => {
    item.avatarTempUrl = urlMap[item.avatarFileId] || item.avatarUrl || ''
    item.coverTempUrl = urlMap[item.coverFileId] || item.coverUrl || item.avatarTempUrl || ''
  })
}

function isCollectionNotFound(error = {}) {
  const message = `${error.errCode || ''} ${error.errMsg || ''} ${error.message || ''}`
  return message.includes('-502005') || message.includes('collection not exist')
}
