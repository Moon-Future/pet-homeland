const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

const ownerDailyLimit = 10
const ownerCooldownMs = 10 * 60 * 1000
const companionTypes = ['cuddle', 'feed', 'checkin']
const memorialTypes = ['miss', 'flower', 'star']
const statFieldByType = {
  cuddle: 'cuddleCount',
  feed: 'feedCount',
  checkin: 'companionCount',
  miss: 'missCount',
  flower: 'flowerCount',
  star: 'starCount',
}
const successTextByType = {
  cuddle: '贴贴成功',
  feed: '喂食成功',
  checkin: '已记录今天',
  miss: '已记下想念',
  flower: '已送花',
  star: '星光已点亮',
}

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext()
  const petSpaceId = sanitizeString(event.petSpaceId, 64)
  const type = sanitizeString(event.type, 24)
  const now = new Date()
  const dateKey = getChinaDateKey(now)

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态' }
  }

  if (!petSpaceId || !type) {
    return { ok: false, message: '缺少互动参数' }
  }

  try {
    await ensureCollection('interactions')

    const current = await db.collection('pet_spaces').doc(petSpaceId).get()
    const petSpace = current.data

    if (!petSpace || petSpace.status === 'deleted') {
      return { ok: false, message: '小窝不存在' }
    }

    const isOwner = petSpace.ownerOpenid === openid
    const lifeStatus = petSpace.lifeStatus || 'with_me'
    const allowedTypes = lifeStatus === 'in_stars' ? memorialTypes : companionTypes

    if (!allowedTypes.includes(type)) {
      return { ok: false, message: '当前状态不支持这个互动' }
    }

    const query = await db.collection('interactions')
      .where({ petSpaceId, openid, type, dateKey })
      .limit(1)
      .get()
    const record = query.data && query.data[0]
    const currentCount = record ? (record.count || 0) : 0
    const dailyLimit = isOwner ? ownerDailyLimit : 1

    if (currentCount >= dailyLimit) {
      return { ok: false, message: isOwner ? '今天这个互动次数已用完' : '今天已经互动过啦' }
    }

    if (isOwner && record && record.lastInteractedAt) {
      const last = new Date(record.lastInteractedAt)
      const elapsed = now.getTime() - last.getTime()

      if (!Number.isNaN(last.getTime()) && elapsed < ownerCooldownMs) {
        const minutes = Math.ceil((ownerCooldownMs - elapsed) / 60000)
        return {
          ok: false,
          message: `${minutes}分钟后可以再次互动`,
          nextAllowedAt: last.getTime() + ownerCooldownMs,
        }
      }
    }

    if (record) {
      await db.collection('interactions').doc(record._id).update({
        data: {
          count: _.inc(1),
          lastInteractedAt: now,
          updatedAt: db.serverDate(),
        },
      })
    } else {
      await db.collection('interactions').add({
        data: {
          petSpaceId,
          openid,
          type,
          dateKey,
          count: 1,
          isOwner,
          lastInteractedAt: now,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })
    }

    const statField = statFieldByType[type]
    await db.collection('pet_spaces').doc(petSpaceId).update({
      data: {
        [`stats.${statField}`]: _.inc(1),
        updatedAt: db.serverDate(),
      },
    })

    const saved = await db.collection('pet_spaces').doc(petSpaceId).get()

    return {
      ok: true,
      message: successTextByType[type] || '已记录',
      countToday: currentCount + 1,
      limit: dailyLimit,
      nextAllowedAt: isOwner ? now.getTime() + ownerCooldownMs : 0,
      stats: saved.data.stats || {},
    }
  } catch (error) {
    return {
      ok: false,
      message: error.message || error.errMsg || '互动失败',
    }
  }
}

async function ensureCollection(name) {
  try {
    await db.collection(name).limit(1).get()
  } catch (error) {
    if (!isCollectionNotFound(error)) {
      throw error
    }

    try {
      await db.createCollection(name)
    } catch (createError) {
      if (!isCollectionAlreadyExists(createError)) {
        throw createError
      }
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
  const message = getErrorText(error)
  return message.includes('-502005') || message.includes('collection not exist')
}

function isCollectionAlreadyExists(error) {
  const message = getErrorText(error)
  return message.includes('already exist') || message.includes('collection already exists')
}

function getErrorText(error = {}) {
  return `${error.errCode || ''} ${error.errMsg || ''} ${error.message || ''}`
}
