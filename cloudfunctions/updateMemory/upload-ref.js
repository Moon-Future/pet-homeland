// AUTO-GENERATED — DO NOT EDIT.
// Edit cloudfunctions/_shared/<source>.js and run: node scripts/sync-shared.js

// Shared validators for qiniu object references persisted by cloud functions.
// Sync source for all cloud function local copies.
// Edit this file, then run: node scripts/sync-shared.js

const BUCKET = 'cl8023'
const KEY_PREFIX = 'project/star-pet/uploads'

async function getUserUid(db, openid) {
  const result = await db.collection('users').where({ openid }).limit(1).get()
  const user = (result.data || [])[0]
  if (!user || !user.uid) {
    throw new Error('用户档案缺少上传身份，请重新登录')
  }
  return user.uid
}

function assertRef(ref, options = {}) {
  const safe = sanitizeRef(ref)
  if (!safe) {
    if (options.optional) {
      return null
    }
    throw new Error(options.message || '图片引用无效')
  }

  if (safe.storage !== 'qiniu' || safe.bucket !== BUCKET) {
    throw new Error(options.message || '图片来源无效')
  }

  const prefix = getExpectedPrefix(options)
  if (!prefix || !safe.key.startsWith(prefix)) {
    throw new Error(options.message || '图片不属于当前账号或小窝')
  }

  return safe
}

function assertRefs(refs, options = {}) {
  if (!Array.isArray(refs)) {
    return []
  }
  return refs.map((ref) => assertRef(ref, options))
}

function assertUserOwnedRef(ref, uid, options = {}) {
  const safe = sanitizeRef(ref)
  if (!safe) {
    if (options.optional) {
      return null
    }
    throw new Error(options.message || '图片引用无效')
  }

  if (safe.storage !== 'qiniu' || safe.bucket !== BUCKET) {
    throw new Error(options.message || '图片来源无效')
  }

  const prefix = `${KEY_PREFIX}/users/${uid}/`
  if (!safe.key.startsWith(prefix)) {
    throw new Error(options.message || '图片不属于当前账号')
  }

  return safe
}

function filterUserOwnedRefs(refs, uid) {
  if (!Array.isArray(refs)) {
    return []
  }

  return refs
    .map((ref) => {
      try {
        return assertUserOwnedRef(ref, uid, { optional: true })
      } catch (error) {
        return null
      }
    })
    .filter(Boolean)
}

function getExpectedPrefix({ uid, petSpaceId, type } = {}) {
  if (!uid) {
    return ''
  }

  if (type === 'avatar') {
    return `${KEY_PREFIX}/users/${uid}/avatars/`
  }

  if (!petSpaceId) {
    return ''
  }

  if (type === 'petCover') {
    return `${KEY_PREFIX}/users/${uid}/pet-spaces/${petSpaceId}/covers/`
  }

  if (type === 'petAlbum') {
    return `${KEY_PREFIX}/users/${uid}/pet-spaces/${petSpaceId}/albums/`
  }

  if (type === 'memory') {
    return `${KEY_PREFIX}/users/${uid}/pet-spaces/${petSpaceId}/memories/`
  }

  return ''
}

function sanitizeRef(ref) {
  if (!ref || typeof ref !== 'object') {
    return null
  }

  const storage = sanitizeString(ref.storage, 32)
  const bucket = sanitizeString(ref.bucket, 64)
  const key = sanitizeString(ref.key, 512)
  if (!storage || !bucket || !key) {
    return null
  }

  return { storage, bucket, key }
}

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().slice(0, maxLength)
}

module.exports = {
  BUCKET,
  KEY_PREFIX,
  assertRef,
  assertRefs,
  assertUserOwnedRef,
  filterUserOwnedRefs,
  getUserUid,
  sanitizeRef,
}
