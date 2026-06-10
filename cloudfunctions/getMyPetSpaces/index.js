const cloud = require('wx-server-sdk')
const storage = require('./storage')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

exports.main = async () => {
  const { OPENID: openid } = cloud.getWXContext()

  if (!openid) {
    return {
      ok: false,
      message: '无法获取微信登录态',
      petSpaces: [],
    }
  }

  try {
    const result = await db.collection('pet_spaces')
      .where({
        ownerOpenid: openid,
        status: _.neq('deleted'),
      })
      .orderBy('updatedAt', 'desc')
      .limit(20)
      .get()

    const petSpaces = result.data || []
    attachPetImageUrls(petSpaces)

    return {
      ok: true,
      petSpaces,
    }
  } catch (error) {
    if (isCollectionNotFound(error)) {
      return {
        ok: true,
        petSpaces: [],
      }
    }

    return {
      ok: false,
      message: error.message || error.errMsg || '读取宠物小窝失败',
      petSpaces: [],
    }
  }
}

async function attachExactStats(petSpaces) {
  await Promise.all((petSpaces || []).map(async (item) => {
    const stats = await getMemoryStats({
      petSpaceId: item._id,
      includeTypes: false,
    })
    item.stats = {
      ...(item.stats || {}),
      memoryCount: stats.memoryCount,
      mediaCount: stats.mediaCount,
    }
  }))
}

async function getMemoryStats({ petSpaceId, includeTypes }) {
  const where = {
    petSpaceId,
    status: _.neq('deleted'),
  }
  const supportedTypes = ['daily', 'growth', 'health', 'travel', 'birthday']
  const typeCounts = supportedTypes.reduce((map, key) => {
    map[key] = 0
    return map
  }, {})
  let skip = 0
  let memoryCount = 0
  let mediaCount = 0
  let hasMore = true

  while (hasMore) {
    const result = await db.collection('memories')
      .where(where)
      .orderBy('sortOrder', 'desc')
      .skip(skip)
      .limit(100)
      .get()
      .catch(handleMissingCollectionQuery)

    const list = result.data || []
    list.forEach((item) => {
      memoryCount += 1
      mediaCount += Array.isArray(item.mediaRefs) ? item.mediaRefs.length : 0
      if (includeTypes) {
        const type = supportedTypes.includes(item.type) ? item.type : 'daily'
        typeCounts[type] += 1
      }
    })

    hasMore = list.length === 100
    skip += list.length
  }

  return {
    memoryCount,
    mediaCount,
    typeCounts,
  }
}

function handleMissingCollectionQuery(error) {
  if (isCollectionNotFound(error)) {
    return { data: [] }
  }

  throw error
}

function attachPetImageUrls(petSpaces) {
  petSpaces.forEach((item) => {
    item.identityClaimed = Boolean(item.identityClaimedAt)
    if (!item.identityClaimed) {
      item.identityNo = ''
    }
    item.avatarUrl = storage.buildUrl(item.avatarRef)
    item.coverUrl = storage.buildUrl(item.coverRef) || item.avatarUrl
  })
}

function isCollectionNotFound(error = {}) {
  const message = `${error.errCode || ''} ${error.errMsg || ''} ${error.message || ''}`
  return message.includes('-502005') || message.includes('collection not exist')
}
