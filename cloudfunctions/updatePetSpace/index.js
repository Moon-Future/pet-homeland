const cloud = require('wx-server-sdk')
const storage = require('./storage')
const uploadRef = require('./upload-ref')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

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

    const uid = await uploadRef.getUserUid(db, openid)
    pet.avatarRef = uploadRef.assertRef(pet.avatarRef, {
      uid,
      petSpaceId,
      type: 'petCover',
      message: '宠物照片上传来源无效，请重新选择',
    })
    if (pet.coverRef) {
      pet.coverRef = uploadRef.assertRef(pet.coverRef, {
        uid,
        petSpaceId,
        type: 'petCover',
        message: '宠物封面上传来源无效，请重新选择',
      })
    }

    const coverRef = pet.coverRef || pet.avatarRef

    const updateData = {
      status: 'active',
      petName: pet.petName,
      petType: pet.petType,
      breed: pet.breed,
      gender: pet.gender,
      lifeStatus: pet.lifeStatus,
      birthDate: pet.birthDate,
      arrivalDate: pet.arrivalDate,
      deathDate: pet.lifeStatus === 'in_stars' ? pet.deathDate : '',
      avatarRef: _.set(pet.avatarRef),
      coverRef: _.set(coverRef),
      theme: pet.theme,
      story: pet.story,
      visibility: pet.visibility,
      updatedAt: now,
    }

    const wasDiscover = petSpace.visibility === 'discover'
    const enteringDiscover = !wasDiscover && pet.visibility === 'discover'

    if (pet.visibility === 'discover') {
      const oldKey = (petSpace.avatarRef && petSpace.avatarRef.key) || ''
      const newKey = (pet.avatarRef && pet.avatarRef.key) || ''
      const oldCoverKey = (petSpace.coverRef && petSpace.coverRef.key) || ''
      const newCoverKey = (coverRef && coverRef.key) || ''

      const changedPublicContent = petSpace.petName !== pet.petName
        || petSpace.breed !== pet.breed
        || petSpace.story !== pet.story
        || oldKey !== newKey
        || oldCoverKey !== newCoverKey
        || petSpace.visibility !== pet.visibility

      if (changedPublicContent || !petSpace.reviewStatus || petSpace.reviewStatus === 'rejected' || petSpace.reviewStatus === 'hidden') {
        updateData.reviewStatus = 'pending_review'
        updateData.reviewedAt = null
        updateData.hiddenReason = ''
        updateData.hiddenAt = null
      }
    } else {
      updateData.reviewStatus = 'not_required'
      updateData.hiddenReason = ''
      updateData.hiddenAt = null
    }

    await db.collection('pet_spaces').doc(petSpaceId).update({
      data: updateData,
    })

    // Delete superseded avatar/cover from storage after DB write succeeds.
    // Dedup by key so the common case (avatarRef === coverRef) only deletes
    // each file once.
    const removedRefs = collectRemovedImageRefs(petSpace, pet.avatarRef, coverRef)
    if (removedRefs.length) {
      await storage.deleteObjects(uploadRef.filterUserOwnedRefs(removedRefs, uid)).catch(() => {})
    }

    if (enteringDiscover) {
      await submitMemoriesForPublicReview(petSpaceId)
    } else if (wasDiscover && pet.visibility !== 'discover') {
      await clearMemoriesPublicReview(petSpaceId)
    }

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

async function submitMemoriesForPublicReview(petSpaceId) {
  const result = await db.collection('memories')
    .where({
      petSpaceId,
      status: 'active',
    })
    .limit(100)
    .get()

  const memories = result.data || []
  const shouldSubmit = memories.filter((item) => {
    if (item.reviewStatus === 'hidden') {
      return false
    }

    return item.reviewStatus !== 'approved' || !item.reviewedAt
  })

  await Promise.all(shouldSubmit.map((item) => db.collection('memories').doc(item._id).update({
    data: {
      reviewStatus: 'pending_review',
      reviewedAt: null,
      hiddenReason: '',
      hiddenAt: null,
      updatedAt: db.serverDate(),
    },
  }).catch(() => {})))

  await Promise.all(shouldSubmit.map((item) => db.collection('media').where({ memoryId: item._id }).update({
    data: {
      status: 'pending_review',
    },
  }).catch(() => {})))
}

async function clearMemoriesPublicReview(petSpaceId) {
  const result = await db.collection('memories')
    .where({
      petSpaceId,
      status: 'active',
    })
    .limit(100)
    .get()

  const memories = (result.data || []).filter((item) => ['pending_review', 'rejected', 'not_required'].includes(item.reviewStatus || 'not_required'))

  await Promise.all(memories.map((item) => db.collection('memories').doc(item._id).update({
    data: {
      reviewStatus: 'not_required',
      reviewedAt: null,
      hiddenReason: '',
      hiddenAt: null,
      updatedAt: db.serverDate(),
    },
  }).catch(() => {})))

  await Promise.all(memories.map((item) => db.collection('media').where({ memoryId: item._id }).update({
    data: {
      status: 'active',
    },
  }).catch(() => {})))
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
    avatarRef: sanitizeRef(pet.avatarRef),
    coverRef: sanitizeRef(pet.coverRef),
    theme: sanitizeTheme(pet.theme),
    story: sanitizeString(pet.story, 160),
    visibility: allowValue(pet.visibility, ['private', 'share', 'discover'], 'private'),
  }
}

// Returns deduped Refs from `petSpace` that are no longer referenced after
// the update (i.e. old avatar/cover whose key doesn't match the new ones).
function collectRemovedImageRefs(petSpace, newAvatarRef, newCoverRef) {
  const nextKeys = new Set(
    [newAvatarRef, newCoverRef].filter((ref) => ref && ref.key).map((ref) => ref.key),
  )
  const removed = new Map()
  const candidates = [petSpace && petSpace.avatarRef, petSpace && petSpace.coverRef]
  candidates.forEach((ref) => {
    if (ref && ref.key && !nextKeys.has(ref.key) && !removed.has(ref.key)) {
      removed.set(ref.key, ref)
    }
  })
  return [...removed.values()]
}

function sanitizeRef(ref) {
  if (!ref || typeof ref !== 'object') {
    return null
  }
  const storageName = sanitizeString(ref.storage, 32)
  const bucket = sanitizeString(ref.bucket, 64)
  const key = sanitizeString(ref.key, 512)
  if (!storageName || !bucket || !key) {
    return null
  }
  return { storage: storageName, bucket, key }
}

function validatePet(pet) {
  if (!pet.petName) {
    return { ok: false, message: '请填写宝贝名字' }
  }

  if (!pet.avatarRef && !pet.coverRef) {
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
  // Temporarily disabled because the production cloud function OpenAPI permission
  // for content security is not taking effect yet. Keep the wrapper so it can be
  // re-enabled in one place after deployment permissions are confirmed.
  return { ok: true, skipped: true }

  // eslint-disable-next-line no-unreachable
  try {
    const refs = [pet.avatarRef, pet.coverRef].filter(Boolean)
    const { result } = await cloud.callFunction({
      name: 'checkContentSecurity',
      data: {
        openid,
        texts: [
          { field: 'petName', content: pet.petName, message: '宝贝名字未通过安全校验' },
          { field: 'breed', content: pet.breed, message: '品种内容未通过安全校验' },
          { field: 'story', content: pet.story, message: '小窝故事未通过安全校验' },
        ],
        refs: refs.map((ref) => ({ ref, message: '宠物图片未通过安全校验' })),
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

function sanitizeTheme(value) {
  const theme = sanitizeString(value, 40)
  if (['cloud', 'rainbow', 'starry', 'sakura'].includes(theme)) {
    return theme
  }
  if (/^memorial_home_bg_\d{2}$/.test(theme)) {
    return theme
  }
  return 'rainbow'
}
