const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext()
  const petSpaceId = sanitizeString(event.petSpaceId, 64)
  const pet = sanitizePet(event.pet)
  const now = db.serverDate()

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态' }
  }

  if (!petSpaceId) {
    return { ok: false, message: '缺少宠物小窝ID' }
  }

  const validation = validatePet(pet)
  if (!validation.ok) {
    return validation
  }

  const security = await checkPetSecurity(openid, pet)
  if (!security.ok) {
    return security
  }

  try {
    const current = await db.collection('pet_spaces').doc(petSpaceId).get()
    const petSpace = current.data

    if (!petSpace || petSpace.ownerOpenid !== openid || petSpace.status === 'deleted') {
      return { ok: false, message: '无权编辑这个小窝' }
    }

    const updateData = {
      petName: pet.petName,
      petType: pet.petType,
      breed: pet.breed,
      gender: pet.gender,
      lifeStatus: pet.lifeStatus,
      birthDate: pet.birthDate,
      arrivalDate: pet.arrivalDate,
      deathDate: pet.lifeStatus === 'in_stars' ? pet.deathDate : '',
      avatarUrl: pet.avatarUrl,
      avatarFileId: pet.avatarFileId,
      coverUrl: pet.coverUrl || pet.avatarUrl,
      coverFileId: pet.coverFileId || pet.avatarFileId,
      theme: pet.theme,
      story: pet.story,
      visibility: pet.visibility,
      updatedAt: now,
    }

    if (pet.visibility === 'discover') {
      const changedPublicContent = petSpace.petName !== pet.petName
        || petSpace.petType !== pet.petType
        || petSpace.lifeStatus !== pet.lifeStatus
        || petSpace.story !== pet.story
        || petSpace.avatarFileId !== pet.avatarFileId
        || petSpace.coverFileId !== (pet.coverFileId || pet.avatarFileId)
        || petSpace.visibility !== pet.visibility

      if (changedPublicContent || !petSpace.reviewStatus || petSpace.reviewStatus === 'rejected' || petSpace.reviewStatus === 'hidden') {
        updateData.reviewStatus = 'pending_review'
        updateData.reviewedAt = null
        updateData.hiddenReason = ''
        updateData.hiddenAt = null
      }
    } else {
      updateData.reviewStatus = 'approved'
      updateData.hiddenReason = ''
      updateData.hiddenAt = null
    }

    await db.collection('pet_spaces').doc(petSpaceId).update({
      data: updateData,
    })

    const saved = await db.collection('pet_spaces').doc(petSpaceId).get()

    return {
      ok: true,
      petSpace: saved.data,
    }
  } catch (error) {
    return {
      ok: false,
      message: error.message || error.errMsg || '保存宠物小窝失败',
    }
  }
}

function sanitizePet(pet = {}) {
  return {
    petName: sanitizeString(pet.petName, 32),
    petType: allowValue(pet.petType, ['cat', 'dog', 'other'], 'other'),
    breed: sanitizeString(pet.breed, 32),
    gender: allowValue(pet.gender, ['male', 'female', 'unknown'], 'unknown'),
    lifeStatus: allowValue(pet.lifeStatus, ['with_me', 'in_stars'], 'with_me'),
    birthDate: sanitizeDate(pet.birthDate),
    arrivalDate: sanitizeDate(pet.arrivalDate),
    deathDate: sanitizeDate(pet.deathDate),
    avatarUrl: sanitizeString(pet.avatarUrl, 512),
    avatarFileId: sanitizeString(pet.avatarFileId, 256),
    coverUrl: sanitizeString(pet.coverUrl, 512),
    coverFileId: sanitizeString(pet.coverFileId, 256),
    theme: allowValue(pet.theme, ['cloud', 'rainbow', 'starry', 'sakura'], 'rainbow'),
    story: sanitizeString(pet.story, 160),
    visibility: allowValue(pet.visibility, ['private', 'share', 'discover'], 'private'),
  }
}

function validatePet(pet) {
  if (!pet.petName) {
    return { ok: false, message: '请填写宝贝名字' }
  }

  if (!pet.avatarFileId && !pet.coverFileId) {
    return { ok: false, message: '请上传宠物照片' }
  }

  if (!pet.birthDate && !pet.arrivalDate) {
    return { ok: false, message: '请选择出生日期或来到身边的日期' }
  }

  if (pet.lifeStatus === 'in_stars' && !pet.deathDate) {
    return { ok: false, message: '请选择离去日期' }
  }

  if (pet.deathDate && pet.birthDate && pet.deathDate < pet.birthDate) {
    return { ok: false, message: '离去日期不能早于出生日期' }
  }

  if (pet.deathDate && pet.arrivalDate && pet.deathDate < pet.arrivalDate) {
    return { ok: false, message: '离去日期不能早于来到身边的日期' }
  }

  return { ok: true }
}

async function checkPetSecurity(openid, pet) {
  try {
    const fileIds = [...new Set([pet.avatarFileId, pet.coverFileId].filter(Boolean))]
    const { result } = await cloud.callFunction({
      name: 'checkContentSecurity',
      data: {
        openid,
        texts: [
          { field: 'petName', content: pet.petName, message: '宝贝名字未通过安全校验' },
          { field: 'breed', content: pet.breed, message: '品种内容未通过安全校验' },
          { field: 'story', content: pet.story, message: '小窝故事未通过安全校验' },
        ],
        fileIds: fileIds.map((fileId) => ({ fileId, message: '宠物图片未通过安全校验' })),
      },
    })

    return result || { ok: false, message: '内容安全校验失败' }
  } catch (error) {
    return { ok: false, message: error.message || error.errMsg || '内容安全校验失败，请稍后重试' }
  }
}

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().slice(0, maxLength)
}

function sanitizeDate(value) {
  const text = sanitizeString(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function allowValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}
