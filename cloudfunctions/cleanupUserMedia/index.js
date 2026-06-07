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

  const cleanup = await collectUserFiles(targetOpenid, {
    includeUserAvatar,
    includePetImages,
    includeMemoryImages,
  })
  const fileList = cleanup.fileIds

  if (!dryRun && fileList.length) {
    await deleteCloudFiles(fileList)
    await markMediaDeleted(targetOpenid, cleanup.memoryFileIds)
  }

  return {
    ok: true,
    dryRun,
    targetOpenid,
    totalFiles: fileList.length,
    deletedFiles: dryRun ? 0 : fileList.length,
    files: fileList,
    summary: cleanup.summary,
  }
}

async function collectUserFiles(openid, options = {}) {
  const fileSet = new Set()
  const memoryFileSet = new Set()
  const summary = {
    userAvatar: 0,
    petImages: 0,
    memoryImages: 0,
  }

  if (options.includeUserAvatar) {
    const users = await db.collection('users').where({ openid }).limit(1).get().catch(() => ({ data: [] }))
    const user = (users.data || [])[0]

    if (user && addFile(fileSet, user.avatarFileId)) {
      summary.userAvatar += 1
    }
  }

  if (options.includePetImages) {
    const pets = await getAllWhere('pet_spaces', { ownerOpenid: openid, status: _.neq('deleted') })
    pets.forEach((pet) => {
      if (addFile(fileSet, pet.avatarFileId)) {
        summary.petImages += 1
      }
      if (addFile(fileSet, pet.coverFileId)) {
        summary.petImages += 1
      }
    })
  }

  if (options.includeMemoryImages) {
    const mediaItems = await getAllWhere('media', { ownerOpenid: openid, status: _.neq('deleted') })
    mediaItems.forEach((media) => {
      if (addFile(fileSet, media.fileId)) {
        summary.memoryImages += 1
      }
      addFile(memoryFileSet, media.fileId)
    })
  }

  return {
    fileIds: [...fileSet],
    memoryFileIds: [...memoryFileSet],
    summary,
  }
}

async function markMediaDeleted(openid, fileIds) {
  const chunks = chunk(fileIds, 20)

  await Promise.all(chunks.map((items) => db.collection('media')
    .where({
      ownerOpenid: openid,
      fileId: _.in(items),
    })
    .update({
      data: {
        status: 'deleted',
        updatedAt: db.serverDate(),
      },
    })
    .catch(() => {})))
}

async function deleteCloudFiles(fileIds) {
  const chunks = chunk(fileIds, 50)

  for (let index = 0; index < chunks.length; index += 1) {
    await cloud.deleteFile({ fileList: chunks[index] }).catch(() => {})
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

function addFile(fileSet, fileId) {
  if (typeof fileId !== 'string' || !fileId.startsWith('cloud://')) {
    return false
  }

  const sizeBefore = fileSet.size
  fileSet.add(fileId)
  return fileSet.size > sizeBefore
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
