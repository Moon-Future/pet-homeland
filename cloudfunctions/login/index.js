const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const grant = require('./grant')
const storage = require('./storage')
const uploadRef = require('./upload-ref')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command
const users = db.collection('users')

const DEFAULT_AVATAR = storage.assetUrl('images/user-default-avatar.jpg')

const UID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const UID_LENGTH = 12
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

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
    const uid = await generateUniqueUid()
    if (profile.avatarRef) {
      profile.avatarRef = uploadRef.assertRef(profile.avatarRef, {
        uid,
        type: 'avatar',
        message: '头像上传来源无效，请重新选择',
      })
    }
    const user = {
      openid,
      uid,
      unionid: wxContext.UNIONID || '',
      appid: wxContext.APPID || '',
      nickname: profile.nickname || '',
      avatarRef: profile.avatarRef || null,
      vip: false,
      role: 'user',
      permissions: {},
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
      user: withAvatarUrl(saved.data),
      sessionGrant: createSessionGrant(openid, saved.data.uid),
    }
  }

  const updateData = {
    lastLoginAt: now,
    updatedAt: now,
  }
  const uid = current.uid || await generateUniqueUid()

  if (profile.nickname) {
    updateData.nickname = profile.nickname
  }

  // Track the old avatar so we can delete it after the DB write succeeds.
  const oldAvatarRef = current.avatarRef || null

  if (profile.avatarRef !== undefined) {
    if (profile.avatarRef) {
      profile.avatarRef = uploadRef.assertRef(profile.avatarRef, {
        uid,
        type: 'avatar',
        message: '头像上传来源无效，请重新选择',
      })
    }
    // Use _.set to replace the whole field. Plain object assignment is treated
    // as a deep merge by wx-server-sdk, which fails when the current value is
    // null because it tries to create sub-fields inside null.
    updateData.avatarRef = _.set(profile.avatarRef)
  }

  // Backfill uid for users created before the qiniu migration. Should be a
  // one-time write per user during the rollout window.
  if (!current.uid) {
    updateData.uid = uid
  }

  await users.doc(current._id).update({
    data: updateData,
  })

  // Delete the old avatar from storage only when this call actually updated
  // avatarRef. Order matters: DB write first so the new ref is persisted; if
  // the delete fails the old file is just orphaned (cleanupUserMedia can sweep it).
  if (profile.avatarRef !== undefined) {
    const newAvatarRef = profile.avatarRef || null
    if (oldAvatarRef && (!newAvatarRef || oldAvatarRef.key !== newAvatarRef.key)) {
      const removable = uploadRef.filterUserOwnedRefs([oldAvatarRef], uid)
      await storage.deleteObjects(removable).catch(() => {})
    }
  }

  const saved = await users.doc(current._id).get()

  return {
    ok: true,
    isNew: false,
    user: withAvatarUrl(saved.data),
    sessionGrant: createSessionGrant(openid, saved.data.uid),
  }
}

// Attach a computed avatarUrl to the response: ref → CDN url, else default.
// avatarUrl is not stored in DB; it is derived from avatarRef on each read.
function withAvatarUrl(user = {}) {
  const url = storage.buildUrl(user.avatarRef) || DEFAULT_AVATAR
  return { ...user, avatarUrl: url }
}

function createSessionGrant(openid, uid) {
  return grant.signGrant({
    v: 1,
    openid,
    uid,
    exp: Date.now() + SESSION_TTL_MS,
  })
}

function sanitizeProfile(profile = {}) {
  return {
    nickname: sanitizeString(profile.nickname, 32),
    avatarRef: sanitizeRef(profile.avatarRef),
  }
}

function sanitizeRef(ref) {
  if (ref === null) {
    return null
  }
  if (!ref || typeof ref !== 'object') {
    return undefined
  }

  const storageName = sanitizeString(ref.storage, 32)
  const bucket = sanitizeString(ref.bucket, 64)
  const key = sanitizeString(ref.key, 512)

  if (!storageName || !bucket || !key) {
    return undefined
  }

  return { storage: storageName, bucket, key }
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

async function generateUniqueUid() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const uid = generateUid()
    const existing = await users.where({ uid }).limit(1).get().catch(() => ({ data: [] }))
    if (!existing.data || !existing.data.length) {
      return uid
    }
  }
  throw new Error('uid allocation failed')
}

function generateUid() {
  const bytes = crypto.randomBytes(UID_LENGTH)
  let uid = ''
  for (let i = 0; i < UID_LENGTH; i += 1) {
    uid += UID_ALPHABET[bytes[i] % UID_ALPHABET.length]
  }
  return uid
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
