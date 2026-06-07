const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

exports.main = async (event = {}) => {
  const { OPENID: callerOpenid } = cloud.getWXContext()
  const targetOpenid = sanitizeString(event.openid || event.targetOpenid, 128)
  const dryRun = event.dryRun !== false
  const deleteFiles = event.deleteFiles !== false

  if (!callerOpenid) {
    return { ok: false, message: 'missing caller openid' }
  }

  if (!targetOpenid) {
    return { ok: false, message: 'missing target openid' }
  }

  if (callerOpenid === targetOpenid) {
    return { ok: false, message: 'cannot delete current admin user' }
  }

  if (!await isAdmin(callerOpenid)) {
    return { ok: false, message: 'admin only' }
  }

  if (await isAdmin(targetOpenid)) {
    return { ok: false, message: 'cannot delete admin user' }
  }

  const summary = await collectUserData(targetOpenid)
  let mediaCleanup = null

  if (deleteFiles) {
    const { result } = await cloud.callFunction({
      name: 'cleanupUserMedia',
      data: {
        targetOpenid,
        dryRun,
        includeUserAvatar: true,
        includePetImages: true,
        includeMemoryImages: true,
      },
    })
    mediaCleanup = result || null

    if (mediaCleanup && !mediaCleanup.ok) {
      return mediaCleanup
    }
  }

  if (!dryRun) {
    await softDeleteUserData(targetOpenid)
  }

  return {
    ok: true,
    dryRun,
    targetOpenid,
    deleteFiles,
    summary,
    mediaCleanup,
  }
}

async function collectUserData(openid) {
  const users = await db.collection('users').where({ openid }).limit(1).get().catch(() => ({ data: [] }))
  const petSpaces = await getAllWhere('pet_spaces', { ownerOpenid: openid, status: _.neq('deleted') })
  const memories = await getAllWhere('memories', { ownerOpenid: openid, status: _.neq('deleted') })
  const media = await getAllWhere('media', { ownerOpenid: openid, status: _.neq('deleted') })
  const feedbacks = await getAllWhere('feedbacks', { openid })

  return {
    userCount: (users.data || []).length,
    petSpaceCount: petSpaces.length,
    memoryCount: memories.length,
    mediaCount: media.length,
    feedbackCount: feedbacks.length,
  }
}

async function softDeleteUserData(openid) {
  const now = db.serverDate()

  await Promise.all([
    db.collection('users').where({ openid }).update({
      data: {
        status: 'deleted',
        updatedAt: now,
      },
    }).catch(() => {}),
    db.collection('pet_spaces').where({ ownerOpenid: openid }).update({
      data: {
        status: 'deleted',
        updatedAt: now,
      },
    }).catch(() => {}),
    db.collection('memories').where({ ownerOpenid: openid }).update({
      data: {
        status: 'deleted',
        updatedAt: now,
      },
    }).catch(() => {}),
    db.collection('media').where({ ownerOpenid: openid }).update({
      data: {
        status: 'deleted',
        updatedAt: now,
      },
    }).catch(() => {}),
  ])
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
      .catch(() => ({ data: [] }))
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
