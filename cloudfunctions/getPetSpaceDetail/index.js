const cloud = require('wx-server-sdk')
const storage = require('./storage')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext()
  const petSpaceId = sanitizeString(event.petSpaceId, 64)
  const source = sanitizeString(event.source, 32)

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态' }
  }

  if (!petSpaceId) {
    return { ok: false, message: '缺少宠物小窝ID' }
  }

  try {
    const current = await db.collection('pet_spaces').doc(petSpaceId).get()
    const petSpace = current.data

    if (!petSpace || petSpace.status === 'deleted') {
      return { ok: false, message: '小窝不存在' }
    }

    const isOwner = petSpace.ownerOpenid === openid
    const isAdmin = source === 'admin_review' ? Boolean(await getAdmin(openid)) : false
    if (!canViewPetSpace(petSpace, openid, isAdmin)) {
      return { ok: false, message: '这个小窝暂时不可访问' }
    }

    const safePetSpace = sanitizePetSpace(petSpace)
    safePetSpace.stats = {
      ...(safePetSpace.stats || {}),
      ...(await getVisibleStats(petSpace._id, isOwner, isAdmin)),
    }
    attachPetImageUrls(safePetSpace)

    return {
      ok: true,
      isOwner,
      isAdmin,
      petSpace: safePetSpace,
    }
  } catch (error) {
    return {
      ok: false,
      message: error.message || error.errMsg || '读取宠物小窝失败',
    }
  }
}

async function getVisibleStats(petSpaceId, isOwner, isAdmin) {
  const canSeeAll = isOwner || isAdmin
  const where = {
    petSpaceId,
    status: canSeeAll ? _.neq('deleted') : 'active',
    ...(canSeeAll ? {} : { reviewStatus: 'approved' }),
  }
  let skip = 0
  let memoryCount = 0
  let mediaCount = 0
  let hasMore = true

  while (hasMore) {
    const result = await db.collection('memories')
      .where(where)
      .orderBy('sortOrder', 'desc')
      .skip(skip)
      .limit(100)
      .get()
      .catch(handleMissingCollectionQuery)

    const list = result.data || []
    list.forEach((item) => {
      memoryCount += 1
      mediaCount += Array.isArray(item.mediaRefs) ? item.mediaRefs.length : 0
    })

    hasMore = list.length === 100
    skip += list.length
  }

  return {
    memoryCount,
    mediaCount,
  }
}

function handleMissingCollectionQuery(error) {
  if (isCollectionNotFound(error)) {
    return { data: [] }
  }

  throw error
}

function sanitizePetSpace(item = {}) {
  const identityClaimed = Boolean(item.identityClaimedAt)

  return {
    _id: item._id,
    identityNo: identityClaimed ? (item.identityNo || '') : '',
    identityCode: item.identityCode || '',
    identityYear: item.identityYear || '',
    identityStatus: item.identityStatus || 'active',
    identityCreatedAt: item.identityCreatedAt || '',
    identityClaimed: identityClaimed,
    identityClaimedAt: item.identityClaimedAt || '',
    identityActivatedAt: item.identityActivatedAt || '',
    nfc: item.nfc || { status: 'unbound', tagId: '', boundAt: null },
    petName: item.petName || '未命名小窝',
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
    stats: item.stats || {},
    status: item.status || 'active',
    reviewStatus: item.reviewStatus || 'approved',
    hiddenReason: item.hiddenReason || '',
    hiddenFromStatus: item.hiddenFromStatus || '',
    hiddenFromReviewStatus: item.hiddenFromReviewStatus || '',
    createdAt: item.createdAt || '',
    updatedAt: item.updatedAt || '',
  }
}

function attachPetImageUrls(petSpace) {
  petSpace.avatarUrl = storage.buildUrl(petSpace.avatarRef)
  petSpace.coverUrl = storage.buildUrl(petSpace.coverRef) || petSpace.avatarUrl
}

async function getAdmin(openid) {
  const result = await db.collection('users').where({ openid, role: 'admin', status: _.neq('deleted') }).limit(1).get()
  return (result.data || [])[0] || null
}

function canViewPetSpace(petSpace = {}, openid, isAdmin = false) {
  if (isAdmin) {
    return true
  }

  if (petSpace.ownerOpenid === openid) {
    return true
  }

  if (petSpace.status !== 'active') {
    return false
  }

  if (petSpace.visibility === 'share') {
    return true
  }

  return petSpace.visibility === 'discover'
    && petSpace.status === 'active'
    && (petSpace.reviewStatus || 'approved') === 'approved'
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
