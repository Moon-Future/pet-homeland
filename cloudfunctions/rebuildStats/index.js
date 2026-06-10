const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

exports.main = async (event = {}) => {
  const { OPENID: callerOpenid } = cloud.getWXContext()
  const targetOpenid = sanitizeString(event.openid || event.targetOpenid, 128)
  const dryRun = event.dryRun === true

  if (!callerOpenid) {
    return { ok: false, message: '无法获取微信登录态' }
  }

  if (!await isAdmin(callerOpenid)) {
    return { ok: false, message: 'admin only' }
  }

  const users = targetOpenid
    ? await getAllWhere('users', { openid: targetOpenid, status: _.neq('deleted') })
    : await getAllWhere('users', { status: _.neq('deleted') })
  const summaries = []

  for (const user of users) {
    const summary = await rebuildUserStats(user.openid, dryRun)
    summaries.push(summary)
  }

  return {
    ok: true,
    dryRun,
    userCount: summaries.length,
    summaries,
  }
}

async function rebuildUserStats(openid, dryRun) {
  const petSpaces = await getAllWhere('pet_spaces', { ownerOpenid: openid, status: _.neq('deleted') })
  let memoryCount = 0
  let mediaCount = 0

  for (const petSpace of petSpaces) {
    const stats = await getPetMemoryStats(petSpace._id)
    memoryCount += stats.memoryCount
    mediaCount += stats.mediaCount

    if (!dryRun) {
      await db.collection('pet_spaces').doc(petSpace._id).update({
        data: {
          'stats.memoryCount': stats.memoryCount,
          'stats.mediaCount': stats.mediaCount,
          updatedAt: db.serverDate(),
        },
      }).catch(() => {})
    }
  }

  const stats = {
    petCount: petSpaces.length,
    memoryCount,
    mediaCount,
  }

  if (!dryRun) {
    await db.collection('users').where({ openid }).update({
      data: {
        'stats.petCount': stats.petCount,
        'stats.memoryCount': stats.memoryCount,
        'stats.mediaCount': stats.mediaCount,
        updatedAt: db.serverDate(),
      },
    }).catch(() => {})
  }

  return {
    openid,
    ...stats,
  }
}

async function getPetMemoryStats(petSpaceId) {
  const memories = await getAllWhere('memories', { petSpaceId, status: _.neq('deleted') })
  let mediaCount = 0
  memories.forEach((memory) => {
    mediaCount += Array.isArray(memory.mediaRefs) ? memory.mediaRefs.length : 0
  })

  return {
    memoryCount: memories.length,
    mediaCount,
  }
}

async function isAdmin(openid) {
  const result = await db.collection('users')
    .where({ openid, role: 'admin', status: _.neq('deleted') })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }))

  return Boolean((result.data || [])[0])
}

async function getAllWhere(collectionName, where) {
  const pageSize = 100
  const items = []
  let skip = 0

  while (true) {
    const result = await db.collection(collectionName)
      .where(where)
      .skip(skip)
      .limit(pageSize)
      .get()
      .catch((error) => {
        if (isCollectionNotFound(error)) {
          return { data: [] }
        }
        throw error
      })
    const page = result.data || []
    items.push(...page)

    if (page.length < pageSize) {
      break
    }

    skip += pageSize
  }

  return items
}

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().slice(0, maxLength)
}

function isCollectionNotFound(error) {
  const message = `${error.errCode || ''} ${error.errMsg || ''} ${error.message || ''}`
  return message.includes('-502005') || message.includes('collection not exist')
}
