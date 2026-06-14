const cloud = require('wx-server-sdk')
const grant = require('./grant')
const uploadRef = require('./upload-ref')

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

  // Accept a pre-reserved _id from the client (returned by reservePetSpaceId).
  // This allows images uploaded before the record exists to use the correct
  // key prefix. If omitted, cloud DB auto-generates one (legacy / admin path).
  const reservedId = sanitizePathPart(event._id)

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

  const security = await checkPetSecurity(openid, pet)
  if (!security.ok) {
    return security
  }

  let identity = null
  try {
    await ensureCollection('pet_spaces')
    await ensureCollection('users')
    const uid = await uploadRef.getUserUid(db, openid)
    const grantCheck = verifyCreateUploadGrant({
      token: event.petUploadGrant,
      uid,
      petSpaceId: reservedId,
    })
    if (!grantCheck.ok) {
      return grantCheck
    }

    pet.avatarRef = uploadRef.assertRef(pet.avatarRef, {
      uid,
      petSpaceId: reservedId,
      type: 'petCover',
      message: '宠物照片上传来源无效，请重新选择',
    })
    if (pet.coverRef) {
      pet.coverRef = uploadRef.assertRef(pet.coverRef, {
        uid,
        petSpaceId: reservedId,
        type: 'petCover',
        message: '宠物封面上传来源无效，请重新选择',
      })
    }
    identity = await generatePetIdentity()
  } catch (error) {
    return {
      ok: false,
      message: error.message || error.errMsg || '创建宠物小窝失败',
    }
  }

  const coverRef = pet.coverRef || pet.avatarRef

  const data = {
    ownerOpenid: openid,
    identityNo: identity.identityNo,
    identityCode: identity.identityCode,
    identityYear: identity.identityYear,
    identityToken: identity.identityToken,
    identityStatus: 'active',
    identityCreatedAt: now,
    identityClaimedAt: null,
    identityActivatedAt: null,
    nfc: {
      status: 'unbound',
      tagId: '',
      boundAt: null,
    },
    petName: pet.petName,
    petType: pet.petType,
    breed: pet.breed,
    gender: pet.gender,
    lifeStatus: pet.lifeStatus,
    birthDate: pet.birthDate,
    arrivalDate: pet.arrivalDate,
    deathDate: pet.lifeStatus === 'in_stars' ? pet.deathDate : '',
    avatarRef: pet.avatarRef,
    coverRef,
    theme: pet.theme,
    story: pet.story,
    visibility: pet.visibility,
    reviewStatus: pet.visibility === 'discover' ? 'pending_review' : 'not_required',
    reportCount: 0,
    hiddenReason: '',
    reviewedAt: null,
    hiddenAt: null,
    stats: {
      companionCount: 0,
      cuddleCount: 0,
      feedCount: 0,
      missCount: 0,
      memoryCount: 0,
      starCount: 0,
      mediaCount: 0,
      flowerCount: 0,
    },
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }

  try {
    const insertData = reservedId ? { _id: reservedId, ...data } : data
    const added = await petSpaces.add({ data: insertData })
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

function verifyCreateUploadGrant({ token, uid, petSpaceId }) {
  if (!petSpaceId) {
    return { ok: false, message: '缺少预分配小窝ID，请重新进入创建页' }
  }

  let payload = null
  try {
    payload = grant.verifyGrant(token)
  } catch (error) {
    return { ok: false, message: error.message || '上传授权已失效，请重新进入创建页' }
  }

  if (!payload || payload.uid !== uid || payload.petSpaceId !== petSpaceId) {
    return { ok: false, message: '上传授权不匹配，请重新进入创建页' }
  }

  const scope = Array.isArray(payload.scope) ? payload.scope : []
  if (!scope.includes('petCover')) {
    return { ok: false, message: '上传授权缺少宠物照片权限' }
  }

  return { ok: true }
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

function sanitizeRef(ref) {
  if (!ref || typeof ref !== 'object') {
    return null
  }
  const storage = sanitizeString(ref.storage, 32)
  const bucket = sanitizeString(ref.bucket, 64)
  const key = sanitizeString(ref.key, 512)
  if (!storage || !bucket || !key) {
    return null
  }
  return { storage, bucket, key }
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

function sanitizePathPart(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)
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

async function generatePetIdentity() {
  const identityYear = new Date().getFullYear()
  const maxAttempts = 20

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const identityCode = generateSixDigitCode()
    const identityNo = `XC-${identityYear}-${identityCode}`
    const identityToken = generateIdentityToken()
    const existing = await petSpaces.where({ identityNo }).limit(1).get()
    const existingToken = await petSpaces.where({ identityToken }).limit(1).get()

    if ((!existing.data || !existing.data.length) && (!existingToken.data || !existingToken.data.length)) {
      return {
        identityNo,
        identityCode,
        identityYear,
        identityToken,
      }
    }
  }

  throw new Error('pet identity code allocation failed')
}

function generateSixDigitCode() {
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0')
}

function generateIdentityToken() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  let token = ''

  for (let index = 0; index < 18; index += 1) {
    token += alphabet.charAt(Math.floor(Math.random() * alphabet.length))
  }

  return token
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
