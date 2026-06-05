const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext()
  const petSpaceId = sanitizeString(event.petSpaceId, 64)
  const dateKey = getChinaDateKey(new Date())

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态' }
  }

  if (!petSpaceId) {
    return { ok: false, message: '缺少宠物小窝ID' }
  }

  try {
    const pet = await db.collection('pet_spaces').doc(petSpaceId).get()
    const petSpace = pet.data

    if (!petSpace || petSpace.status === 'deleted') {
      return { ok: false, message: '小窝不存在' }
    }

    const isOwner = petSpace.ownerOpenid === openid
    const todayCounts = {}

    try {
      const query = await db.collection('interactions')
        .where({ petSpaceId, openid, dateKey })
        .limit(20)
        .get()

      ;(query.data || []).forEach((item) => {
        todayCounts[item.type] = item.count || 0
      })
    } catch (error) {
      if (!isCollectionNotFound(error)) {
        throw error
      }
    }

    return {
      ok: true,
      isOwner,
      limit: isOwner ? 10 : 1,
      todayCounts,
    }
  } catch (error) {
    return {
      ok: false,
      message: error.message || error.errMsg || '读取互动次数失败',
    }
  }
}

function getChinaDateKey(date) {
  const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return chinaTime.toISOString().slice(0, 10)
}

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().slice(0, maxLength)
}

function isCollectionNotFound(error) {
  const message = `${error.errCode || ''} ${error.errMsg || ''} ${error.message || ''}`
  return message.includes('-502005') || message.includes('collection not exist')
}
