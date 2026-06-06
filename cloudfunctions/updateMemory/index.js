const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

const maxImages = 3
const allowedTypes = ['daily', 'growth', 'health', 'travel', 'birthday']

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext()
  const memoryId = sanitizeString(event.memoryId, 64)
  const action = sanitizeString(event.action, 16) || 'update'

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
      await adjustStats(existing.petSpaceId, openid, -1, -(existing.mediaFileIds || []).length)
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

    const oldMedia = existing.mediaFileIds || []
    const nextMedia = memory.mediaFileIds
    const oldSet = new Set(oldMedia)
    const nextSet = new Set(nextMedia)
    const removed = oldMedia.filter((fileId) => !nextSet.has(fileId))
    const added = nextMedia.filter((fileId) => !oldSet.has(fileId))

    const petSpace = await db.collection('pet_spaces').doc(existing.petSpaceId).get()
    const shouldReview = petSpace.data && petSpace.data.visibility === 'discover'

    await db.collection('memories').doc(memoryId).update({
      data: {
        title: memory.title || getDefaultTitle(memory.type),
        content: memory.content,
        memoryDate: memory.memoryDate,
        type: memory.type,
        mediaFileIds: nextMedia,
        sortOrder: new Date(memory.memoryDate).getTime() || existing.sortOrder || Date.now(),
        reviewStatus: shouldReview ? 'pending_review' : 'approved',
        reviewedAt: null,
        hiddenReason: '',
        hiddenAt: null,
        updatedAt: db.serverDate(),
      },
    })

    await Promise.all(removed.map((fileId) => db.collection('media').where({ memoryId, fileId }).update({
      data: { status: 'deleted' },
    }).catch(() => {})))

    await Promise.all(added.map((fileId, index) => db.collection('media').add({
      data: {
        petSpaceId: existing.petSpaceId,
        ownerOpenid: openid,
        memoryId,
        fileId,
        type: 'image',
        category: 'memory',
        sortOrder: oldMedia.length + index,
        status: shouldReview ? 'pending_review' : 'active',
        createdAt: db.serverDate(),
      },
    })))

    await adjustStats(existing.petSpaceId, openid, 0, added.length - removed.length)
    const saved = await db.collection('memories').doc(memoryId).get()

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

async function adjustStats(petSpaceId, openid, memoryDelta, mediaDelta) {
  const data = {
    updatedAt: db.serverDate(),
  }

  if (memoryDelta) {
    data['stats.memoryCount'] = _.inc(memoryDelta)
  }

  if (mediaDelta) {
    data['stats.mediaCount'] = _.inc(mediaDelta)
  }

  if (memoryDelta || mediaDelta) {
    await db.collection('pet_spaces').doc(petSpaceId).update({ data })
    await db.collection('users').where({ openid }).update({ data }).catch(() => {})
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
