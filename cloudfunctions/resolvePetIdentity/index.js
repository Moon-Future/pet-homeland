const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()

exports.main = async (event = {}) => {
  const token = sanitizeString(event.token, 64)
  const identityNo = normalizeIdentityNo(event.identityNo || event.code)

  if (!token && !identityNo) {
    return { ok: false, message: 'missing pet identity' }
  }

  try {
    const where = token ? { identityToken: token } : { identityNo }
    const result = await db.collection('pet_spaces').where(where).limit(1).get()
    const petSpace = (result.data || [])[0]

    if (!petSpace || petSpace.status === 'deleted') {
      return { ok: false, message: 'pet identity not found' }
    }

    const safePetSpace = sanitizePetSpace(petSpace)
    await attachPetImageUrls(safePetSpace)

    return {
      ok: true,
      petSpace: safePetSpace,
    }
  } catch (error) {
    if (isCollectionNotFound(error)) {
      return { ok: false, message: 'pet identity not found' }
    }

    return {
      ok: false,
      message: error.message || error.errMsg || 'resolve pet identity failed',
    }
  }
}

function sanitizePetSpace(item = {}) {
  return {
    _id: item._id,
    identityNo: item.identityNo || '',
    identityYear: item.identityYear || '',
    identityStatus: item.identityStatus || 'active',
    identityCreatedAt: item.identityCreatedAt || '',
    nfc: item.nfc || { status: 'unbound', tagId: '', boundAt: null },
    petName: item.petName || '',
    petType: item.petType || 'other',
    breed: item.breed || '',
    gender: item.gender || 'unknown',
    lifeStatus: item.lifeStatus || 'with_me',
    birthDate: item.birthDate || '',
    arrivalDate: item.arrivalDate || '',
    deathDate: item.deathDate || '',
    avatarUrl: item.avatarUrl || '',
    avatarFileId: item.avatarFileId || '',
    coverUrl: item.coverUrl || '',
    coverFileId: item.coverFileId || '',
    avatarTempUrl: '',
    coverTempUrl: '',
    theme: item.theme || 'rainbow',
    story: item.story || '',
    visibility: item.visibility || 'private',
    status: item.status || 'active',
    stats: item.stats || {},
  }
}

async function attachPetImageUrls(petSpace) {
  const fileIds = [...new Set([petSpace.avatarFileId, petSpace.coverFileId].filter(Boolean))]

  if (!fileIds.length) {
    petSpace.avatarTempUrl = petSpace.avatarUrl || ''
    petSpace.coverTempUrl = petSpace.coverUrl || petSpace.avatarTempUrl || ''
    return
  }

  const urlResult = await cloud.getTempFileURL({ fileList: fileIds }).catch(() => ({ fileList: [] }))
  const urlMap = (urlResult.fileList || []).reduce((map, item) => {
    if (item.fileID && item.tempFileURL) {
      map[item.fileID] = item.tempFileURL
    }
    return map
  }, {})

  petSpace.avatarTempUrl = urlMap[petSpace.avatarFileId] || petSpace.avatarUrl || ''
  petSpace.coverTempUrl = urlMap[petSpace.coverFileId] || petSpace.coverUrl || petSpace.avatarTempUrl || ''
}

function normalizeIdentityNo(value) {
  const text = sanitizeString(value, 32).toUpperCase()
  return /^XC-\d{4}-\d{6}$/.test(text) ? text : ''
}

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().slice(0, maxLength)
}

function isCollectionNotFound(error = {}) {
  const message = `${error.errCode || ''} ${error.errMsg || ''} ${error.message || ''}`
  return message.includes('-502005') || message.includes('collection not exist')
}
