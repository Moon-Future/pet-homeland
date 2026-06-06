const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext()
  const limit = Math.min(Math.max(Number(event.limit) || 30, 1), 50)

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态' }
  }

  const admin = await getAdmin(openid)
  if (!admin) {
    return { ok: false, message: '无管理员权限' }
  }

  const [petSpaces, memories, reports, hiddenItems] = await Promise.all([
    getPendingPetSpaces(limit),
    getPendingMemories(limit),
    getOpenReports(limit),
    getHiddenItems(limit),
  ])

  return {
    ok: true,
    petSpaces,
    memories,
    reports,
    hiddenItems,
  }
}

async function getAdmin(openid) {
  await ensureCollection('users')
  const result = await db.collection('users').where({ openid, role: 'admin', status: _.neq('deleted') }).limit(1).get()
  return (result.data || [])[0] || null
}

async function getPendingPetSpaces(limit) {
  try {
    await ensureCollection('pet_spaces')
    const result = await db.collection('pet_spaces')
      .where({
        status: 'active',
        visibility: 'discover',
      })
      .orderBy('updatedAt', 'desc')
      .limit(100)
      .get()

    const petSpaces = (result.data || [])
      .filter((item) => !item.reviewStatus || item.reviewStatus === 'pending_review')
      .slice(0, limit)
      .map(normalizePetSpace)
    await attachPetImageUrls(petSpaces)
    return petSpaces
  } catch (error) {
    if (isCollectionNotFound(error)) {
      return []
    }
    throw error
  }
}

async function getPendingMemories(limit) {
  try {
    await ensureCollection('memories')
    const result = await db.collection('memories')
      .where({
        status: 'active',
        reviewStatus: 'pending_review',
      })
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get()

    return (result.data || []).map(normalizeMemory)
  } catch (error) {
    if (isCollectionNotFound(error)) {
      return []
    }
    throw error
  }
}

async function getOpenReports(limit) {
  try {
    await ensureCollection('reports')
    const result = await db.collection('reports')
      .where({
        status: 'open',
      })
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get()

    return (result.data || []).map(normalizeReport)
  } catch (error) {
    if (isCollectionNotFound(error)) {
      return []
    }
    throw error
  }
}

async function getHiddenItems(limit) {
  const [petSpaces, memories] = await Promise.all([
    getHiddenPetSpaces(limit),
    getHiddenMemories(limit),
  ])

  return [...petSpaces, ...memories]
    .sort((a, b) => getTimeValue(b.updatedAt) - getTimeValue(a.updatedAt))
    .slice(0, limit)
}

async function getHiddenPetSpaces(limit) {
  try {
    await ensureCollection('pet_spaces')
    const result = await db.collection('pet_spaces')
      .where({
        reviewStatus: 'hidden',
      })
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get()

    const petSpaces = (result.data || []).map((item) => normalizeHiddenPetSpace(item))
    await attachPetImageUrls(petSpaces)
    return petSpaces
  } catch (error) {
    if (isCollectionNotFound(error)) {
      return []
    }
    throw error
  }
}

async function getHiddenMemories(limit) {
  try {
    await ensureCollection('memories')
    const result = await db.collection('memories')
      .where({
        reviewStatus: 'hidden',
      })
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get()

    return (result.data || []).map(normalizeHiddenMemory)
  } catch (error) {
    if (isCollectionNotFound(error)) {
      return []
    }
    throw error
  }
}

function normalizePetSpace(item = {}) {
  return {
    _id: item._id,
    petName: item.petName || '未命名小窝',
    petType: item.petType || 'other',
    lifeStatus: item.lifeStatus || 'with_me',
    avatarFileId: item.avatarFileId || '',
    coverFileId: item.coverFileId || '',
    avatarUrl: item.avatarUrl || '',
    coverUrl: item.coverUrl || '',
    avatarTempUrl: item.avatarTempUrl || '',
    coverTempUrl: item.coverTempUrl || '',
    story: item.story || '',
    ownerOpenid: item.ownerOpenid || '',
    reviewStatus: item.reviewStatus || 'pending_review',
    reportCount: item.reportCount || 0,
    updatedAt: item.updatedAt || '',
  }
}

function normalizeHiddenPetSpace(item = {}) {
  return {
    ...normalizePetSpace(item),
    _id: `pet_space:${item._id}`,
    targetId: item._id,
    targetType: 'pet_space',
    hiddenReason: item.hiddenReason || '',
    hiddenFromStatus: item.hiddenFromStatus || '',
    hiddenFromReviewStatus: item.hiddenFromReviewStatus || '',
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

function normalizeMemory(item = {}) {
  return {
    _id: item._id,
    petSpaceId: item.petSpaceId || '',
    title: item.title || '今天的记录',
    content: item.content || '',
    memoryDate: item.memoryDate || '',
    mediaFileIds: item.mediaFileIds || [],
    ownerOpenid: item.ownerOpenid || '',
    reviewStatus: item.reviewStatus || 'pending_review',
    updatedAt: item.updatedAt || '',
  }
}

function normalizeHiddenMemory(item = {}) {
  return {
    ...normalizeMemory(item),
    _id: `memory:${item._id}`,
    targetId: item._id,
    targetType: 'memory',
    hiddenReason: item.hiddenReason || '',
    hiddenFromStatus: item.hiddenFromStatus || '',
    hiddenFromReviewStatus: item.hiddenFromReviewStatus || '',
  }
}

function normalizeReport(item = {}) {
  return {
    _id: item._id,
    targetType: item.targetType || 'pet_space',
    targetId: item.targetId || '',
    reason: item.reason || '',
    detail: item.detail || '',
    reporterOpenid: item.reporterOpenid || '',
    status: item.status || 'open',
    createdAt: item.createdAt || '',
  }
}

async function ensureCollection(name) {
  try {
    await db.collection(name).limit(1).get()
  } catch (error) {
    if (!isCollectionNotFound(error)) {
      throw error
    }

    await db.createCollection(name).catch((createError) => {
      if (!isCollectionAlreadyExists(createError)) {
        throw createError
      }
    })
  }
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

function getTimeValue(value) {
  if (!value) {
    return 0
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === 'string') {
    const time = new Date(value).getTime()
    return Number.isNaN(time) ? 0 : time
  }

  if (typeof value === 'object' && value.$date) {
    const time = new Date(value.$date).getTime()
    return Number.isNaN(time) ? 0 : time
  }

  return 0
}
