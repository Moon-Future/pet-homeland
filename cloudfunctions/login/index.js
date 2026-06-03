const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const users = db.collection('users')

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const now = db.serverDate()
  const profile = sanitizeProfile(event.profile)

  if (!openid) {
    return {
      ok: false,
      message: '无法获取微信登录态',
    }
  }

  await ensureUsersCollection()

  const existing = await users.where({ openid }).limit(1).get()
  const current = existing.data && existing.data[0]

  if (!current) {
    const user = {
      openid,
      unionid: wxContext.UNIONID || '',
      appid: wxContext.APPID || '',
      nickname: profile.nickname || '',
      avatarUrl: profile.avatarUrl || '',
      avatarFileId: profile.avatarFileId || '',
      vip: false,
      stats: {
        petCount: 0,
        memoryCount: 0,
        mediaCount: 0,
        shareCount: 0,
      },
      status: 'active',
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    }

    const added = await users.add({ data: user })
    const saved = await users.doc(added._id).get()

    return {
      ok: true,
      isNew: true,
      user: saved.data,
    }
  }

  const updateData = {
    lastLoginAt: now,
    updatedAt: now,
  }

  if (profile.nickname) {
    updateData.nickname = profile.nickname
  }

  if (profile.avatarUrl) {
    updateData.avatarUrl = profile.avatarUrl
  }

  if (profile.avatarFileId) {
    updateData.avatarFileId = profile.avatarFileId
  }

  await users.doc(current._id).update({
    data: updateData,
  })
  const saved = await users.doc(current._id).get()

  return {
    ok: true,
    isNew: false,
    user: saved.data,
  }
}

function sanitizeProfile(profile = {}) {
  return {
    nickname: sanitizeString(profile.nickname, 32),
    avatarUrl: sanitizeString(profile.avatarUrl, 512),
    avatarFileId: sanitizeString(profile.avatarFileId, 256),
  }
}

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().slice(0, maxLength)
}

async function ensureUsersCollection() {
  try {
    await users.limit(1).get()
  } catch (error) {
    if (!isCollectionNotFound(error)) {
      throw error
    }

    try {
      await db.createCollection('users')
    } catch (createError) {
      if (!isCollectionAlreadyExists(createError)) {
        throw createError
      }
    }
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
