const cloud = require('wx-server-sdk')

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

    return {
      ok: true,
      isOwner,
      isAdmin,
      petSpace: sanitizePetSpace(petSpace),
    }
  } catch (error) {
    return {
      ok: false,
      message: error.message || error.errMsg || '读取宠物小窝失败',
    }
  }
}

function sanitizePetSpace(item = {}) {
  return {
    _id: item._id,
    petName: item.petName || '未命名小窝',
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
    theme: item.theme || 'rainbow',
    story: item.story || '',
    visibility: item.visibility || 'private',
    stats: item.stats || {},
    status: item.status || 'active',
    reviewStatus: item.reviewStatus || 'approved',
    hiddenReason: item.hiddenReason || '',
    createdAt: item.createdAt || '',
    updatedAt: item.updatedAt || '',
  }
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
