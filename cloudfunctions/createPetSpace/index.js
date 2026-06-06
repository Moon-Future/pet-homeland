const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command
const petSpaces = db.collection('pet_spaces')

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext()
  const now = db.serverDate()
  const pet = sanitizePet(event.pet)

  if (!openid) {
    return {
      ok: false,
      message: '无法获取微信登录态',
    }
  }

  const validation = validatePet(pet)
  if (!validation.ok) {
    return validation
  }

  await ensureCollection('pet_spaces')

  const data = {
    ownerOpenid: openid,
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
    stats: {
      companionCount: 0,
      cuddleCount: 0,
      feedCount: 0,
      missCount: 0,
      memoryCount: 0,
      starCount: 0,
      mediaCount: pet.coverFileId || pet.avatarFileId ? 1 : 0,
      flowerCount: 0,
    },
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }

  try {
    const added = await petSpaces.add({ data })
    await incrementUserPetCount(openid)
    const saved = await petSpaces.doc(added._id).get()

    return {
      ok: true,
      petSpace: saved.data,
    }
  } catch (error) {
    return {
      ok: false,
      message: error.message || error.errMsg || '创建宠物小窝失败',
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

async function incrementUserPetCount(openid) {
  try {
    await ensureCollection('users')
    await db.collection('users').where({ openid }).update({
      data: {
        'stats.petCount': _.inc(1),
        updatedAt: db.serverDate(),
      },
    })
  } catch (error) {
    // User stats are secondary; the pet space record is the source of truth.
  }
}

async function ensureCollection(name) {
  try {
    await db.collection(name).limit(1).get()
  } catch (error) {
    if (!isCollectionNotFound(error)) {
      throw error
    }

    try {
      await db.createCollection(name)
    } catch (createError) {
      if (!isCollectionAlreadyExists(createError)) {
        throw createError
      }
    }
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

function isCollectionNotFound(error) {
  const message = getErrorText(error)
  return message.includes('-502005') || message.includes('collection not exist')
}

function isCollectionAlreadyExists(error) {
  const message = getErrorText(error)
  return message.includes('already exist') || message.includes('collection already exists')
}

function getErrorText(error = {}) {
  return `${error.errCode || ''} ${error.errMsg || ''} ${error.message || ''}`
}
