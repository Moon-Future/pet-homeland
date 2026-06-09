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
    const doc = await db.collection('pet_spaces').doc(petSpaceId).get()
    const petSpace = doc.data

    if (!petSpace || petSpace.status === 'deleted') {
      return { ok: false, message: '小窝不存在' }
    }

    if (petSpace.ownerOpenid !== openid) {
      return { ok: false, message: '只有主人可以领取爱宠身份证' }
    }

    if (petSpace.identityClaimedAt) {
      return {
        ok: true,
        alreadyClaimed: true,
        petSpace: sanitizePetSpace(petSpace),
      }
    }

    await db.collection('pet_spaces').doc(petSpaceId).update({
      data: {
        identityClaimedAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    })

    const updated = await db.collection('pet_spaces').doc(petSpaceId).get()

    return {
      ok: true,
      petSpace: sanitizePetSpace(updated.data),
    }
  } catch (error) {
    return {
      ok: false,
      message: error.message || error.errMsg || '领取爱宠身份证失败',
    }
  }
}

function sanitizePetSpace(item = {}) {
  const claimed = Boolean(item.identityClaimedAt)

  return {
    _id: item._id,
    identityNo: claimed ? (item.identityNo || '') : '',
    identityStatus: item.identityStatus || 'active',
    identityClaimed: claimed,
    identityClaimedAt: item.identityClaimedAt || '',
    identityToken: claimed ? (item.identityToken || '') : '',
  }
}

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().slice(0, maxLength)
}
