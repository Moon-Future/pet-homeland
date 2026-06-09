const cloud = require('wx-server-sdk')
const storage = require('./storage')

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

    if (!petSpace || petSpace.status === 'deleted' || !petSpace.identityClaimedAt) {
      return { ok: false, message: 'pet identity not found' }
    }

    const safePetSpace = sanitizePetSpace(petSpace)
    attachPetImageUrls(safePetSpace)

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
    identityClaimed: true,
    identityClaimedAt: item.identityClaimedAt || '',
    nfc: item.nfc || { status: 'unbound', tagId: '', boundAt: null },
    petName: item.petName || '',
    petType: item.petType || 'other',
    breed: item.breed || '',
    gender: item.gender || 'unknown',
    lifeStatus: item.lifeStatus || 'with_me',
    birthDate: item.birthDate || '',
    arrivalDate: item.arrivalDate || '',
    deathDate: item.deathDate || '',
    avatarRef: item.avatarRef || null,
    coverRef: item.coverRef || null,
    avatarUrl: '',
    coverUrl: '',
    theme: item.theme || 'rainbow',
    story: item.story || '',
    visibility: item.visibility || 'private',
    status: item.status || 'active',
    stats: item.stats || {},
  }
}

function attachPetImageUrls(petSpace) {
  petSpace.avatarUrl = storage.buildUrl(petSpace.avatarRef)
  petSpace.coverUrl = storage.buildUrl(petSpace.coverRef) || petSpace.avatarUrl
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
