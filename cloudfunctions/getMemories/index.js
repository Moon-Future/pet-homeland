const cloud = require('wx-server-sdk')

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

    let query = db.collection('memories').where({
      status: _.neq('deleted'),
    })

    if (memoryId) {
      query = db.collection('memories').where({
        _id: memoryId,
        status: _.neq('deleted'),
      })
    } else {
      const petSpace = await getViewablePetSpace(petSpaceId)
      if (!petSpace) {
        return { ok: false, message: '小窝不存在', memories: [] }
      }

      query = db.collection('memories').where({
        petSpaceId,
        status: _.neq('deleted'),
        ...(type && type !== 'all' ? { type } : {}),
      })
    }

    const result = await query
      .orderBy('sortOrder', 'desc')
      .limit(limit)
      .get()

    const memories = result.data || []
    if (memoryId && memories[0] && memories[0].ownerOpenid !== openid) {
      const petSpace = await getViewablePetSpace(memories[0].petSpaceId)
      if (!petSpace) {
        return { ok: false, message: '无权查看这条记录', memories: [] }
      }
    }

    await attachMediaUrls(memories)

    return {
      ok: true,
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

async function getViewablePetSpace(petSpaceId) {
  try {
    const current = await db.collection('pet_spaces').doc(petSpaceId).get()
    const petSpace = current.data
    if (!petSpace || petSpace.status === 'deleted') {
      return null
    }

    return petSpace
  } catch (error) {
    if (isDocumentNotFound(error)) {
      return null
    }

    throw error
  }
}

async function attachMediaUrls(memories) {
  const fileIds = [...new Set(memories.flatMap((item) => item.mediaFileIds || []))]

  if (!fileIds.length) {
    memories.forEach((item) => {
      item.mediaUrls = []
    })
    return
  }

  const urlResult = await cloud.getTempFileURL({
    fileList: fileIds,
  })
  const urlMap = (urlResult.fileList || []).reduce((map, item) => {
    if (item.fileID && item.tempFileURL) {
      map[item.fileID] = item.tempFileURL
    }
    return map
  }, {})

  memories.forEach((item) => {
    item.mediaUrls = (item.mediaFileIds || []).map((fileId) => urlMap[fileId] || fileId)
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
