const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

const memoryImageLimit = 30

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext()
  const excludeFileIds = sanitizeFileIds(event.excludeFileIds)
  const nextImageCount = Math.max(Number(event.nextImageCount) || 0, 0)

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态' }
  }

  try {
    await ensureCollection('media')

    const used = await getUsedMemoryImageCount(openid)
    const excluded = excludeFileIds.length ? await getOwnedMemoryImageCount(openid, excludeFileIds) : 0
    const projectedUsed = Math.max(used - excluded, 0) + nextImageCount
    const remaining = Math.max(memoryImageLimit - Math.max(used - excluded, 0), 0)

    if (projectedUsed > memoryImageLimit) {
      return {
        ok: false,
        limit: memoryImageLimit,
        used,
        remaining,
        message: `图片额度不足，每人最多可上传${memoryImageLimit}张回忆图片`,
      }
    }

    return {
      ok: true,
      limit: memoryImageLimit,
      used,
      remaining,
    }
  } catch (error) {
    if (isCollectionNotFound(error)) {
      return {
        ok: true,
        limit: memoryImageLimit,
        used: 0,
        remaining: memoryImageLimit,
      }
    }

    return {
      ok: false,
      message: error.message || error.errMsg || '读取图片额度失败',
    }
  }
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

async function getOwnedMemoryImageCount(openid, fileIds) {
  const result = await db.collection('media')
    .where({
      ownerOpenid: openid,
      category: 'memory',
      type: 'image',
      fileId: _.in(fileIds),
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
  }
}

function sanitizeFileIds(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return [...new Set(value
    .filter((fileId) => typeof fileId === 'string' && fileId.trim())
    .map((fileId) => fileId.trim().slice(0, 512)))]
    .slice(0, 100)
}

function isCollectionNotFound(error) {
  const message = getErrorText(error)
  return message.includes('-502005') || message.includes('collection not exist')
}

function getErrorText(error = {}) {
  return `${error.errCode || ''} ${error.errMsg || ''} ${error.message || ''}`
}
