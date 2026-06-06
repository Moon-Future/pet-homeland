const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

const maxImages = 3
const memoryImageLimit = 30
const allowedTypes = ['daily', 'growth', 'health', 'travel', 'birthday']

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext()
  const petSpaceId = sanitizeString(event.petSpaceId, 64)
  const memory = sanitizeMemory(event.memory)

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态' }
  }

  if (!petSpaceId) {
    return { ok: false, message: '缺少宠物小窝' }
  }

  const validation = validateMemory(memory)
  if (!validation.ok) {
    return validation
  }

  const security = await checkMemorySecurity(openid, memory)
  if (!security.ok) {
    return security
  }

  try {
    await ensureCollection('memories')
    await ensureCollection('media')
    await ensureCollection('pet_spaces')

    const current = await db.collection('pet_spaces').doc(petSpaceId).get()
    const petSpace = current.data

    if (!petSpace || petSpace.status === 'deleted') {
      return { ok: false, message: '小窝不存在' }
    }

    if (petSpace.ownerOpenid !== openid) {
      return { ok: false, message: '只有小窝主人可以记录' }
    }

    const quota = await checkMemoryImageQuota(openid, memory.mediaFileIds.length)
    if (!quota.ok) {
      return quota
    }

    const now = db.serverDate()
    const reviewStatus = petSpace.visibility === 'discover' ? 'pending_review' : 'not_required'
    const added = await db.collection('memories').add({
      data: {
        petSpaceId,
        ownerOpenid: openid,
        title: memory.title || getDefaultTitle(memory.type),
        content: memory.content,
        memoryDate: memory.memoryDate,
        type: memory.type,
        mediaFileIds: memory.mediaFileIds,
        sortOrder: new Date(memory.memoryDate).getTime() || Date.now(),
        status: 'active',
        reviewStatus,
        reviewedAt: null,
        hiddenReason: '',
        hiddenAt: null,
        createdAt: now,
        updatedAt: now,
      },
    })

    await Promise.all(memory.mediaFileIds.map((fileId, index) => db.collection('media').add({
      data: {
        petSpaceId,
        ownerOpenid: openid,
        memoryId: added._id,
        fileId,
        type: 'image',
        category: 'memory',
        sortOrder: index,
        status: reviewStatus === 'pending_review' ? 'pending_review' : 'active',
        createdAt: db.serverDate(),
      },
    })))

    await db.collection('pet_spaces').doc(petSpaceId).update({
      data: {
        'stats.memoryCount': _.inc(1),
        'stats.mediaCount': _.inc(memory.mediaFileIds.length),
        updatedAt: db.serverDate(),
      },
    })
    await incrementUserStats(openid, memory.mediaFileIds.length)

    const saved = await db.collection('memories').doc(added._id).get()

    return {
      ok: true,
      memory: saved.data,
    }
  } catch (error) {
    return {
      ok: false,
      message: error.message || error.errMsg || '保存记录失败',
    }
  }
}

async function incrementUserStats(openid, mediaCount) {
  try {
    await ensureCollection('users')
    await db.collection('users').where({ openid }).update({
      data: {
        'stats.memoryCount': _.inc(1),
        'stats.mediaCount': _.inc(mediaCount),
        updatedAt: db.serverDate(),
      },
    })
  } catch (error) {
    // User stats are secondary; the pet space record is the source of truth.
  }
}

async function checkMemoryImageQuota(openid, nextImageCount) {
  if (!nextImageCount) {
    return { ok: true }
  }

  const used = await getUsedMemoryImageCount(openid)
  if (used + nextImageCount > memoryImageLimit) {
    return {
      ok: false,
      message: `图片额度不足，每人最多可上传${memoryImageLimit}张回忆图片`,
      limit: memoryImageLimit,
      used,
      remaining: Math.max(memoryImageLimit - used, 0),
    }
  }

  return { ok: true }
}

async function getUsedMemoryImageCount(openid) {
  const result = await db.collection('media')
    .where({
      ownerOpenid: openid,
      category: 'memory',
      type: 'image',
      status: _.neq('deleted'),
    })
    .count()

  return result.total || 0
}

function sanitizeMemory(memory = {}) {
  const mediaFileIds = Array.isArray(memory.mediaFileIds)
    ? memory.mediaFileIds
      .filter((fileId) => typeof fileId === 'string' && fileId.trim())
      .map((fileId) => fileId.trim().slice(0, 512))
      .slice(0, maxImages)
    : []

  return {
    title: sanitizeString(memory.title, 32),
    content: sanitizeString(memory.content, 500),
    memoryDate: sanitizeDate(memory.memoryDate) || getChinaDateKey(new Date()),
    type: allowValue(memory.type, allowedTypes, 'daily'),
    mediaFileIds,
  }
}

function validateMemory(memory) {
  if (!memory.content && !memory.mediaFileIds.length) {
    return { ok: false, message: '写点文字或上传照片吧' }
  }

  if (memory.mediaFileIds.length > maxImages) {
    return { ok: false, message: '最多上传3张照片' }
  }

  return { ok: true }
}

async function checkMemorySecurity(openid, memory) {
  // Temporarily disabled because the production cloud function OpenAPI permission
  // for content security is not taking effect yet. Keep the wrapper so it can be
  // re-enabled in one place after deployment permissions are confirmed.
  return { ok: true, skipped: true }

  try {
    const { result } = await cloud.callFunction({
      name: 'checkContentSecurity',
      data: {
        openid,
        texts: [
          { field: 'title', content: memory.title, message: '记录标题未通过安全校验' },
          { field: 'content', content: memory.content, message: '记录内容未通过安全校验' },
        ],
        fileIds: memory.mediaFileIds.map((fileId) => ({ fileId, message: '记录图片未通过安全校验' })),
      },
    })

    return result || { ok: false, message: '内容安全校验失败' }
  } catch (error) {
    return { ok: false, message: error.message || error.errMsg || '内容安全校验失败，请稍后重试' }
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

function getDefaultTitle(type) {
  const titleByType = {
    daily: '今天的记录',
    growth: '成长记录',
    health: '健康记录',
    travel: '旅行记录',
    birthday: '生日记录',
  }

  return titleByType[type] || '今天的记录'
}

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().slice(0, maxLength)
}

function sanitizeDate(value) {
  const text = sanitizeString(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function allowValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}

function getChinaDateKey(date) {
  const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  return chinaTime.toISOString().slice(0, 10)
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
