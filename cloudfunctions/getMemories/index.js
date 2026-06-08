const cloud = require('wx-server-sdk')
const storage = require('./storage')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext()
  const petSpaceId = sanitizeString(event.petSpaceId, 64)
  const memoryId = sanitizeString(event.memoryId, 64)
  const type = sanitizeString(event.type, 24)
  const source = sanitizeString(event.source, 32)
  const limit = Math.min(Math.max(Number(event.limit) || 50, 1), 100)

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态', memories: [] }
  }

  if (!petSpaceId && !memoryId) {
    return { ok: false, message: '缺少宠物小窝', memories: [] }
  }

  try {
    await ensureCollection('memories')
    await ensureCollection('pet_spaces')

    let ownerView = false
    const adminView = source === 'admin_review' ? Boolean(await getAdmin(openid)) : false
    let query = db.collection('memories').where({ status: 'active' })

    if (memoryId) {
      query = db.collection('memories').where({
        _id: memoryId,
        status: _.neq('deleted'),
      })
    } else {
      const petSpace = await getViewablePetSpace(petSpaceId, openid)
      if (!petSpace && !adminView) {
        return { ok: false, message: '小窝不存在', memories: [] }
      }

      ownerView = petSpace && petSpace.ownerOpenid === openid

      query = db.collection('memories').where({
        petSpaceId,
        status: ownerView || adminView ? _.neq('deleted') : 'active',
        ...(ownerView || adminView ? {} : { reviewStatus: 'approved' }),
        ...(type && type !== 'all' ? { type } : {}),
      })
    }

    const result = await query
      .orderBy('sortOrder', 'desc')
      .limit(limit)
      .get()

    const memories = result.data || []
    if (memoryId && memories[0] && memories[0].ownerOpenid !== openid && !adminView) {
      const petSpace = await getViewablePetSpace(memories[0].petSpaceId, openid)
      if (!petSpace) {
        return { ok: false, message: '无权查看这条记录', memories: [] }
      }
      if (memories[0].status !== 'active' || (memories[0].reviewStatus || 'approved') !== 'approved') {
        return { ok: false, message: '这条记录暂未公开', memories: [] }
      }
    }

    attachMediaUrls(memories)

    return {
      ok: true,
      isAdmin: adminView,
      memories,
    }
  } catch (error) {
    if (isCollectionNotFound(error)) {
      return { ok: true, memories: [] }
    }

    return {
      ok: false,
      message: error.message || error.errMsg || '读取回忆失败',
      memories: [],
    }
  }
}

async function getViewablePetSpace(petSpaceId, openid) {
  try {
    const current = await db.collection('pet_spaces').doc(petSpaceId).get()
    const petSpace = current.data
    if (!petSpace || petSpace.status === 'deleted') {
      return null
    }

    if (petSpace.ownerOpenid === openid) {
      return petSpace
    }

    if (petSpace.status !== 'active') {
      return null
    }

    if (petSpace.visibility === 'share') {
      return petSpace
    }

    if (petSpace.visibility === 'discover' && (petSpace.reviewStatus || 'approved') === 'approved') {
      return petSpace
    }

    return null
  } catch (error) {
    if (isDocumentNotFound(error)) {
      return null
    }

    throw error
  }
}

async function getAdmin(openid) {
  const result = await db.collection('users').where({ openid, role: 'admin', status: _.neq('deleted') }).limit(1).get()
  return (result.data || [])[0] || null
}

function attachMediaUrls(memories) {
  memories.forEach((item) => {
    const refs = item.mediaRefs || []
    item.mediaUrls = refs.map((ref) => storage.buildUrl(ref))
  })
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

function isDocumentNotFound(error) {
  const message = getErrorText(error)
  return message.includes('-502003') || message.includes('document not exist')
}

function getErrorText(error = {}) {
  return `${error.errCode || ''} ${error.errMsg || ''} ${error.message || ''}`
}
