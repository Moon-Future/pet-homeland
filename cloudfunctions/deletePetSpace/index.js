const cloud = require('wx-server-sdk')
const storage = require('./storage')
const uploadRef = require('./upload-ref')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext()
  const petSpaceId = sanitizeString(event.petSpaceId, 64)

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态' }
  }

  if (!petSpaceId) {
    return { ok: false, message: '缺少宠物小窝ID' }
  }

  try {
    const current = await db.collection('pet_spaces').doc(petSpaceId).get()
    const petSpace = current.data

    if (!petSpace || petSpace.ownerOpenid !== openid || petSpace.status === 'deleted') {
      return { ok: false, message: '无权删除这个小窝' }
    }

    const [memories, media, uid] = await Promise.all([
      getAllWhere('memories', {
        petSpaceId,
        ownerOpenid: openid,
        status: _.neq('deleted'),
      }),
      getAllWhere('media', {
        petSpaceId,
        ownerOpenid: openid,
        status: _.neq('deleted'),
      }),
      uploadRef.getUserUid(db, openid),
    ])
    const refs = collectRefs(petSpace, memories, media)
    const now = db.serverDate()

    await Promise.all([
      db.collection('pet_spaces').doc(petSpaceId).update({
        data: {
          status: 'deleted',
          updatedAt: now,
        },
      }),
      db.collection('memories').where({
        petSpaceId,
        ownerOpenid: openid,
      }).update({
        data: {
          status: 'deleted',
          updatedAt: now,
        },
      }).catch(() => {}),
      db.collection('media').where({
        petSpaceId,
        ownerOpenid: openid,
      }).update({
        data: {
          status: 'deleted',
          updatedAt: now,
        },
      }).catch(() => {}),
    ])

    await adjustUserStats(openid, memories.length, media.length)

    const cleanup = await storage.deleteObjects(uploadRef.filterUserOwnedRefs(refs, uid)).catch((error) => ({
      successCount: 0,
      failCount: refs.length,
      failedKeys: refs.map((ref) => ref.key).filter(Boolean),
      message: error.message || error.errMsg || '清理图片失败',
    }))
    const nextPetSpaceId = await getNextPetSpaceId(openid)

    return {
      ok: true,
      deletedPetSpaceId: petSpaceId,
      nextPetSpaceId,
      cleanup,
    }
  } catch (error) {
    return {
      ok: false,
      message: error.message || error.errMsg || '删除宠物小窝失败',
    }
  }
}

function collectRefs(petSpace = {}, memories = [], media = []) {
  const refs = []
  addRef(refs, petSpace.avatarRef)
  addRef(refs, petSpace.coverRef)

  memories.forEach((memory) => {
    const memoryRefs = memory.mediaRefs || []
    memoryRefs.forEach((ref) => addRef(refs, ref))
  })

  media.forEach((item) => {
    addRef(refs, {
      storage: item.storage,
      bucket: item.bucket,
      key: item.key,
    })
  })

  const seen = new Set()
  return refs.filter((ref) => {
    if (!ref || !ref.key || seen.has(ref.key)) {
      return false
    }
    seen.add(ref.key)
    return true
  })
}

function addRef(refs, ref) {
  const safe = uploadRef.sanitizeRef(ref)
  if (safe) {
    refs.push(safe)
  }
}

async function adjustUserStats(openid, memoryCount, mediaCount) {
  const data = {
    'stats.petCount': _.inc(-1),
    updatedAt: db.serverDate(),
  }

  if (memoryCount) {
    data['stats.memoryCount'] = _.inc(-memoryCount)
  }

  if (mediaCount) {
    data['stats.mediaCount'] = _.inc(-mediaCount)
  }

  await db.collection('users').where({ openid }).update({ data }).catch(() => {})
}

async function getNextPetSpaceId(openid) {
  const result = await db.collection('pet_spaces')
    .where({
      ownerOpenid: openid,
      status: _.neq('deleted'),
    })
    .orderBy('updatedAt', 'desc')
    .limit(1)
    .get()
    .catch(() => ({ data: [] }))
  const petSpace = (result.data || [])[0]
  return (petSpace && petSpace._id) || ''
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
