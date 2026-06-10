const cloud = require('wx-server-sdk')
const storage = require('./storage')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

const maxLimit = 20

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext()
  const filter = sanitizeString(event.filter, 16) || 'all'
  const limit = Math.min(Math.max(Number(event.limit) || maxLimit, 1), maxLimit)
  const cursor = Number(event.cursor || 0)

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态', petSpaces: [] }
  }

  try {
    await ensureCollection('pet_spaces')

    const where = {
      status: 'active',
      visibility: 'discover',
      reviewStatus: 'approved',
    }

    if (filter === 'with_me' || filter === 'in_stars') {
      where.lifeStatus = filter
    }

    if (filter === 'cat' || filter === 'dog' || filter === 'other') {
      where.petType = filter
    }

    if (cursor > 0) {
      where.updatedAt = _.lt(new Date(cursor))
    }

    const result = await db.collection('pet_spaces')
      .where(where)
      .orderBy('updatedAt', 'desc')
      .limit(filter === 'recent' || cursor > 0 ? limit + 1 : 100)
      .get()

    const page = result.data || []
    const pagedMode = filter === 'recent' || cursor > 0
    const hasMore = pagedMode && page.length > limit
    const pageItems = pagedMode && hasMore ? page.slice(0, limit) : page
    const source = pagedMode ? pageItems : shuffle(page).slice(0, limit)
    const petSpaces = source
      .slice(0, limit)
      .map((item) => sanitizePetSpace(item, openid))
    attachPetImageUrls(petSpaces)

    return {
      ok: true,
      petSpaces,
      total: petSpaces.length,
      nextCursor: hasMore ? getCursorValue(pageItems[pageItems.length - 1]) : 0,
    }
  } catch (error) {
    if (isCollectionNotFound(error)) {
      return { ok: true, petSpaces: [], total: 0 }
    }

    return {
      ok: false,
      message: error.message || error.errMsg || '读取星空广场失败',
      petSpaces: [],
    }
  }
}

function getCursorValue(item = {}) {
  const value = item.updatedAt
  if (!value) {
    return 0
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function sanitizePetSpace(item = {}, openid) {
  return {
    _id: item._id,
    petName: item.petName || '未命名小窝',
    petType: item.petType || 'other',
    lifeStatus: item.lifeStatus || 'with_me',
    birthDate: item.birthDate || '',
    arrivalDate: item.arrivalDate || '',
    deathDate: item.deathDate || '',
    avatarRef: item.avatarRef || null,
    coverRef: item.coverRef || null,
    avatarUrl: '',
    coverUrl: '',
    story: item.story || '',
    theme: item.theme || 'rainbow',
    visibility: item.visibility || 'private',
    stats: item.stats || {},
    isOwner: item.ownerOpenid === openid,
  }
}

function attachPetImageUrls(petSpaces) {
  petSpaces.forEach((item) => {
    item.avatarUrl = storage.buildUrl(item.avatarRef)
    item.coverUrl = storage.buildUrl(item.coverRef) || item.avatarUrl
  })
}

function shuffle(list) {
  const items = list.slice()

  for (let index = items.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    const current = items[index]
    items[index] = items[target]
    items[target] = current
  }

  return items
}

async function ensureCollection(name) {
  try {
    await db.collection(name).limit(1).get()
  } catch (error) {
    if (!isCollectionNotFound(error)) {
      throw error
    }
  }
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

function getErrorText(error = {}) {
  return `${error.errCode || ''} ${error.errMsg || ''} ${error.message || ''}`
}
