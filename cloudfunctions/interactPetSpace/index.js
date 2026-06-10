const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

const ownerDailyLimit = 10
const ownerCooldownMs = 10 * 60 * 1000
const companionTypes = ['cuddle', 'feed', 'checkin', 'paw']
const memorialTypes = ['miss', 'flower', 'star', 'paw']
const statFieldByType = {
  cuddle: 'cuddleCount',
  feed: 'feedCount',
  checkin: 'companionCount',
  miss: 'missCount',
  flower: 'flowerCount',
  star: 'starCount',
  paw: 'pawCount',
}
const successTextByType = {
  cuddle: '贴贴成功',
  feed: '喂食成功',
  checkin: '已记录今天',
  miss: '已记下想念',
  flower: '已送花',
  star: '星光已点亮',
  paw: '已留下爪印',
}

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext()
  const petSpaceId = sanitizeString(event.petSpaceId, 64)
  const type = sanitizeString(event.type, 24)
  const source = allowValue(event.source, ['star_square', 'share', 'pet_detail', 'owner_detail'], 'pet_detail')
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
    if (!isOwner && !canVisitorInteract(petSpace)) {
      return { ok: false, message: '这个小窝暂时不可互动' }
    }

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
    const isFirstVisitorInteraction = !isOwner ? !await hasVisitorInteractedBefore(petSpaceId, openid) : false

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
          lastSource: source,
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
          source,
          lastInteractedAt: now,
          createdAt: db.serverDate(),
          updatedAt: db.serverDate(),
        },
      })
    }

    const statField = statFieldByType[type]
    const statUpdate = {
      [`stats.${statField}`]: _.inc(1),
      updatedAt: db.serverDate(),
    }
    if (isFirstVisitorInteraction) {
      statUpdate['stats.visitorCountAllTime'] = _.inc(1)
    }
    await db.collection('pet_spaces').doc(petSpaceId).update({
      data: statUpdate,
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

async function hasVisitorInteractedBefore(petSpaceId, openid) {
  const result = await db.collection('interactions')
    .where({ petSpaceId, openid, isOwner: false })
    .limit(1)
    .get()
    .catch((error) => {
      if (isCollectionNotFound(error)) {
        return { data: [] }
      }
      throw error
    })

  return Boolean((result.data || []).length)
}

function canVisitorInteract(petSpace = {}) {
  if (petSpace.status !== 'active') {
    return false
  }

  if (petSpace.visibility === 'share') {
    return true
  }

  return petSpace.visibility === 'discover'
    && (petSpace.reviewStatus || 'approved') === 'approved'
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

function allowValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
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
