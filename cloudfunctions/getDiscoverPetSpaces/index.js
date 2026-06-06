const cloud = require('wx-server-sdk')

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

    const result = await db.collection('pet_spaces')
      .where(where)
      .orderBy('updatedAt', 'desc')
      .limit(100)
      .get()

    const source = filter === 'recent' ? (result.data || []) : shuffle(result.data || [])
    const petSpaces = source
      .slice(0, limit)
      .map((item) => sanitizePetSpace(item, openid))

    return {
      ok: true,
      petSpaces,
      total: petSpaces.length,
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

function sanitizePetSpace(item = {}, openid) {
  return {
    _id: item._id,
    petName: item.petName || '未命名小窝',
    petType: item.petType || 'other',
    lifeStatus: item.lifeStatus || 'with_me',
    birthDate: item.birthDate || '',
    arrivalDate: item.arrivalDate || '',
    deathDate: item.deathDate || '',
    avatarFileId: item.avatarFileId || '',
    coverFileId: item.coverFileId || '',
    avatarUrl: item.avatarUrl || '',
    coverUrl: item.coverUrl || '',
    story: item.story || '',
    theme: item.theme || 'rainbow',
    visibility: item.visibility || 'private',
    stats: item.stats || {},
    isOwner: item.ownerOpenid === openid,
  }
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
