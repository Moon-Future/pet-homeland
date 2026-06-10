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
    if (!isOwner && !canVisitorViewSummary(petSpace)) {
      return { ok: false, message: '这个小窝暂时不可访问' }
    }

    const todayCounts = {}
    let visitorCountToday = 0
    let visitorInteractionCountToday = 0
    let visitorCountAllTime = 0

    try {
      const query = await db.collection('interactions')
        .where({ petSpaceId, openid, dateKey })
        .limit(20)
        .get()

      ;(query.data || []).forEach((item) => {
        todayCounts[item.type] = item.count || 0
      })

      if (isOwner) {
        const visitors = await db.collection('interactions')
          .where({ petSpaceId, dateKey, isOwner: false })
          .limit(100)
          .get()
        const visitorOpenids = {}

        ;(visitors.data || []).forEach((item) => {
          if (item.openid) {
            visitorOpenids[item.openid] = true
          }
          visitorInteractionCountToday += item.count || 0
        })

        visitorCountToday = Object.keys(visitorOpenids).length
        visitorCountAllTime = (petSpace.stats && petSpace.stats.visitorCountAllTime) || 0
      }
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
      visitorCountToday,
      visitorInteractionCountToday,
      visitorCountAllTime,
    }
  } catch (error) {
    return {
      ok: false,
      message: error.message || error.errMsg || '读取互动次数失败',
    }
  }
}

function canVisitorViewSummary(petSpace = {}) {
  if (petSpace.status !== 'active') {
    return false
  }

  if (petSpace.visibility === 'share') {
    return true
  }

  return petSpace.visibility === 'discover'
    && (petSpace.reviewStatus || 'approved') === 'approved'
}

async function countAllTimeVisitors(petSpaceId) {
  const visitorOpenids = {}
  const batchSize = 100
  let offset = 0

  while (true) {
    const result = await db.collection('interactions')
      .where({ petSpaceId, isOwner: false })
      .skip(offset)
      .limit(batchSize)
      .get()

    const list = result.data || []
    list.forEach((item) => {
      if (item.openid) {
        visitorOpenids[item.openid] = true
      }
    })

    if (list.length < batchSize) {
      break
    }

    offset += batchSize
  }

  return Object.keys(visitorOpenids).length
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
