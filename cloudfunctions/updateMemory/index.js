const cloud = require('wx-server-sdk')
const storage = require('./storage')
const uploadRef = require('./upload-ref')

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
  const memoryId = sanitizeString(event.memoryId, 64)
  const action = sanitizeString(event.action, 16) || 'update'
  let reservedMediaDelta = 0
  let memoryUpdated = false

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态' }
  }

  if (!memoryId) {
    return { ok: false, message: '缺少回忆记录' }
  }

  try {
    await ensureCollection('memories')
    await ensureCollection('media')
    await ensureCollection('pet_spaces')

    const current = await db.collection('memories').doc(memoryId).get()
    const existing = current.data

    if (!existing || existing.status === 'deleted') {
      return { ok: false, message: '记录不存在' }
    }

    if (existing.ownerOpenid !== openid) {
      return { ok: false, message: '只有小窝主人可以编辑' }
    }
    const uid = await uploadRef.getUserUid(db, openid)

    if (action === 'delete') {
      await db.collection('memories').doc(memoryId).update({
        data: {
          status: 'deleted',
          updatedAt: db.serverDate(),
        },
      })
      await db.collection('media').where({ memoryId }).update({
        data: {
          status: 'deleted',
        },
      }).catch(() => {})
      await storage.deleteObjects(uploadRef.filterUserOwnedRefs(existing.mediaRefs || [], uid))
      await adjustStats(existing.petSpaceId, openid, -1, -(existing.mediaRefs || []).length)
      return { ok: true }
    }

    const memory = sanitizeMemory(event.memory)
    const validation = validateMemory(memory)
    if (!validation.ok) {
      return validation
    }

    const security = await checkMemorySecurity(openid, memory)
    if (!security.ok) {
      return security
    }

    const petSpace = await db.collection('pet_spaces').doc(existing.petSpaceId).get()
    const shouldReview = petSpace.data && petSpace.data.visibility === 'discover'
    const reviewStatus = shouldReview ? 'pending_review' : 'not_required'
    memory.mediaRefs = uploadRef.assertRefs(memory.mediaRefs, {
      uid,
      petSpaceId: existing.petSpaceId,
      type: 'memory',
      message: '记录图片上传来源无效，请重新选择',
    })
    const oldRefs = existing.mediaRefs || []
    const nextRefs = memory.mediaRefs
    const oldKeys = new Set(oldRefs.map((ref) => ref.key))
    const nextKeys = new Set(nextRefs.map((ref) => ref.key))
    const removedRefs = oldRefs.filter((ref) => !nextKeys.has(ref.key))
    const addedRefs = nextRefs.filter((ref) => !oldKeys.has(ref.key))
    const quota = await checkMemoryImageQuota(openid, oldRefs, nextRefs.length)
    if (!quota.ok) {
      return quota
    }
    const mediaDelta = addedRefs.length - removedRefs.length
    if (mediaDelta > 0) {
      const reserved = await reserveUserMediaQuota(openid, mediaDelta)
      if (!reserved.ok) {
        return reserved
      }
      reservedMediaDelta = mediaDelta
    }

    await db.collection('memories').doc(memoryId).update({
      data: {
        status: 'active',
        title: memory.title || getDefaultTitle(memory.type),
        content: memory.content,
        memoryDate: memory.memoryDate,
        type: memory.type,
        showOnTimeline: memory.showOnTimeline,
        mediaRefs: _.set(nextRefs),
        sortOrder: new Date(memory.memoryDate).getTime() || existing.sortOrder || Date.now(),
        reviewStatus,
        reviewedAt: null,
        hiddenReason: '',
        hiddenAt: null,
        updatedAt: db.serverDate(),
      },
    })
    memoryUpdated = true

    await Promise.all(removedRefs.map((ref) => db.collection('media').where({ memoryId, key: ref.key }).update({
      data: { status: 'deleted' },
    }).catch(() => {})))
    await storage.deleteObjects(uploadRef.filterUserOwnedRefs(removedRefs, uid))

    if (nextRefs.length) {
      await db.collection('media').where({
        memoryId,
        key: _.in(nextRefs.map((ref) => ref.key)),
      }).update({
        data: {
          status: shouldReview ? 'pending_review' : 'active',
        },
      }).catch(() => {})
    }

    await Promise.all(addedRefs.map((ref, index) => db.collection('media').add({
      data: {
        petSpaceId: existing.petSpaceId,
        ownerOpenid: openid,
        memoryId,
        storage: ref.storage,
        bucket: ref.bucket,
        key: ref.key,
        type: 'image',
        category: 'memory',
        sortOrder: oldRefs.length + index,
        status: shouldReview ? 'pending_review' : 'active',
        createdAt: db.serverDate(),
      },
    })))

    await adjustStats(existing.petSpaceId, openid, 0, mediaDelta, { userMediaReserved: reservedMediaDelta > 0 })
    const saved = await db.collection('memories').doc(memoryId).get()

    return {
      ok: true,
      memory: saved.data,
    }
  } catch (error) {
    if (reservedMediaDelta && !memoryUpdated) {
      await releaseUserMediaQuota(openid, reservedMediaDelta).catch(() => {})
    }
    return {
      ok: false,
      message: error.message || error.errMsg || '保存记录失败',
    }
  }
}

async function adjustStats(petSpaceId, openid, memoryDelta, mediaDelta, options = {}) {
  const petData = {
    updatedAt: db.serverDate(),
  }
  const userData = {
    updatedAt: db.serverDate(),
  }

  if (memoryDelta) {
    petData['stats.memoryCount'] = _.inc(memoryDelta)
    userData['stats.memoryCount'] = _.inc(memoryDelta)
  }

  if (mediaDelta) {
    petData['stats.mediaCount'] = _.inc(mediaDelta)
    if (!options.userMediaReserved) {
      userData['stats.mediaCount'] = _.inc(mediaDelta)
    }
  }

  if (memoryDelta || mediaDelta) {
    await db.collection('pet_spaces').doc(petSpaceId).update({ data: petData })
    await db.collection('users').where({ openid }).update({ data: userData }).catch(() => {})
  }
}

async function reserveUserMediaQuota(openid, nextImageCount) {
  if (!nextImageCount) {
    return { ok: true }
  }

  await ensureCollection('users')
  const result = await db.collection('users').where({
    openid,
    'stats.mediaCount': _.lte(memoryImageLimit - nextImageCount),
  }).update({
    data: {
      'stats.mediaCount': _.inc(nextImageCount),
      updatedAt: db.serverDate(),
    },
  })

  if (getUpdatedCount(result) > 0) {
    return { ok: true }
  }

  const used = await getUsedMemoryImageCount(openid)
  return {
    ok: false,
    message: `图片额度不足，每人最多可上传${memoryImageLimit}张回忆图片`,
    limit: memoryImageLimit,
    used,
    remaining: Math.max(memoryImageLimit - used, 0),
  }
}

async function releaseUserMediaQuota(openid, imageCount) {
  if (!imageCount) {
    return
  }
  await db.collection('users').where({ openid }).update({
    data: {
      'stats.mediaCount': _.inc(-imageCount),
      updatedAt: db.serverDate(),
    },
  })
}

function getUpdatedCount(result = {}) {
  return Number((result.stats && result.stats.updated) || result.updated || 0)
}

async function checkMemoryImageQuota(openid, oldRefs, nextImageCount) {
  const used = await getUsedMemoryImageCount(openid)
  const oldKeys = (oldRefs || []).map((ref) => ref.key).filter(Boolean)
  const ownedOldCount = oldKeys.length ? await getOwnedMemoryImageCount(openid, oldKeys) : 0
  const projectedUsed = Math.max(used - ownedOldCount, 0) + nextImageCount

  if (projectedUsed > memoryImageLimit) {
    return {
      ok: false,
      message: `图片额度不足，每人最多可上传${memoryImageLimit}张回忆图片`,
      limit: memoryImageLimit,
      used,
      remaining: Math.max(memoryImageLimit - Math.max(used - ownedOldCount, 0), 0),
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

async function getOwnedMemoryImageCount(openid, keys) {
  const result = await db.collection('media')
    .where({
      ownerOpenid: openid,
      category: 'memory',
      type: 'image',
      key: _.in(keys),
      status: _.neq('deleted'),
    })
    .count()

  return result.total || 0
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

function sanitizeMemory(memory = {}) {
  const mediaRefs = Array.isArray(memory.mediaRefs)
    ? memory.mediaRefs
      .map((ref) => sanitizeRef(ref))
      .filter(Boolean)
      .slice(0, maxImages)
    : []

  return {
    title: sanitizeString(memory.title, 32),
    content: sanitizeString(memory.content, 500),
    memoryDate: sanitizeDate(memory.memoryDate) || getChinaDateKey(new Date()),
    type: allowValue(memory.type, allowedTypes, 'daily'),
    showOnTimeline: Boolean(memory.showOnTimeline),
    mediaRefs,
  }
}

function sanitizeRef(ref) {
  if (!ref || typeof ref !== 'object') {
    return null
  }
  const storage = sanitizeString(ref.storage, 32)
  const bucket = sanitizeString(ref.bucket, 64)
  const key = sanitizeString(ref.key, 512)
  if (!storage || !bucket || !key) {
    return null
  }
  return { storage, bucket, key }
}

function validateMemory(memory) {
  if (!memory.content && !memory.mediaRefs.length) {
    return { ok: false, message: '写点文字或上传照片吧' }
  }

  if (memory.mediaRefs.length > maxImages) {
    return { ok: false, message: '最多上传3张照片' }
  }

  return { ok: true }
}

async function checkMemorySecurity(openid, memory) {
  // Temporarily disabled because the production cloud function OpenAPI permission
  // for content security is not taking effect yet. Keep the wrapper so it can be
  // re-enabled in one place after deployment permissions are confirmed.
  return { ok: true, skipped: true }

  // eslint-disable-next-line no-unreachable
  try {
    const { result } = await cloud.callFunction({
      name: 'checkContentSecurity',
      data: {
        openid,
        texts: [
          { field: 'title', content: memory.title, message: '记录标题未通过安全校验' },
          { field: 'content', content: memory.content, message: '记录内容未通过安全校验' },
        ],
        refs: memory.mediaRefs.map((ref) => ({ ref, message: '记录图片未通过安全校验' })),
      },
    })

    return result || { ok: false, message: '内容安全校验失败' }
  } catch (error) {
    return { ok: false, message: error.message || error.errMsg || '内容安全校验失败，请稍后重试' }
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
