const cloud = require('wx-server-sdk')
const storage = require('./storage')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

exports.main = async (event = {}) => {
  const { OPENID: callerOpenid } = cloud.getWXContext()
  const targetOpenid = sanitizeString(event.openid || event.targetOpenid, 128)
  const dryRun = event.dryRun !== false
  const includeUserAvatar = event.includeUserAvatar !== false
  const includePetImages = event.includePetImages !== false
  const includeMemoryImages = event.includeMemoryImages !== false

  if (!callerOpenid) {
    return { ok: false, message: 'missing caller openid' }
  }

  if (!targetOpenid) {
    return { ok: false, message: 'missing target openid' }
  }

  if (!await isAdmin(callerOpenid)) {
    return { ok: false, message: 'admin only' }
  }

  const cleanup = await collectUserRefs(targetOpenid, {
    includeUserAvatar,
    includePetImages,
    includeMemoryImages,
  })
  const refs = cleanup.refs

  if (!dryRun && refs.length) {
    await storage.deleteObjects(refs)
    await markMediaDeleted(targetOpenid, cleanup.memoryKeys)
  }

  return {
    ok: true,
    dryRun,
    targetOpenid,
    totalFiles: refs.length,
    deletedFiles: dryRun ? 0 : refs.length,
    files: refs.map((ref) => ref.key),
    summary: cleanup.summary,
  }
}

async function collectUserRefs(openid, options = {}) {
  const seen = new Set()
  const refs = []
  const memoryKeys = new Set()
  const summary = {
    userAvatar: 0,
    petImages: 0,
    memoryImages: 0,
  }

  const pushRef = (ref, category) => {
    if (!ref || !ref.key || seen.has(ref.key)) {
      return false
    }
    seen.add(ref.key)
    refs.push(ref)
    summary[category] += 1
    return true
  }

  if (options.includeUserAvatar) {
    const users = await db.collection('users').where({ openid }).limit(1).get().catch(() => ({ data: [] }))
    const user = (users.data || [])[0]
    if (user && user.avatarRef) {
      pushRef(user.avatarRef, 'userAvatar')
    }
  }

  if (options.includePetImages) {
    const pets = await getAllWhere('pet_spaces', { ownerOpenid: openid, status: _.neq('deleted') })
    pets.forEach((pet) => {
      if (pet.avatarRef) {
        pushRef(pet.avatarRef, 'petImages')
      }
      if (pet.coverRef) {
        pushRef(pet.coverRef, 'petImages')
      }
    })
  }

  if (options.includeMemoryImages) {
    const mediaItems = await getAllWhere('media', { ownerOpenid: openid, status: _.neq('deleted') })
    mediaItems.forEach((media) => {
      if (!media.key) {
        return
      }
      const ref = {
        storage: media.storage || 'qiniu',
        bucket: media.bucket || 'cl8023',
        key: media.key,
      }
      if (pushRef(ref, 'memoryImages')) {
        memoryKeys.add(media.key)
      }
    })
  }

  return {
    refs,
    memoryKeys: [...memoryKeys],
    summary,
  }
}

async function markMediaDeleted(openid, keys) {
  const chunks = chunk(keys, 20)

  await Promise.all(chunks.map((items) => db.collection('media')
    .where({
      ownerOpenid: openid,
      key: _.in(items),
    })
    .update({
      data: {
        status: 'deleted',
        updatedAt: db.serverDate(),
      },
    })
    .catch(() => {})))
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

function chunk(items, size) {
  const chunks = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().slice(0, maxLength)
}
