const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()

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

    if (!petSpace || petSpace.status === 'deleted') {
      return { ok: false, message: '小窝不存在' }
    }

    return {
      ok: true,
      isOwner: petSpace.ownerOpenid === openid,
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
    stats: item.stats || {},
    status: item.status || 'active',
    createdAt: item.createdAt || '',
    updatedAt: item.updatedAt || '',
  }
}

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().slice(0, maxLength)
}
