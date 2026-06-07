const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

exports.main = async () => {
  const { OPENID: openid } = cloud.getWXContext()

  if (!openid) {
    return {
      ok: false,
      message: '无法获取微信登录态',
      petSpaces: [],
    }
  }

  try {
    const result = await db.collection('pet_spaces')
      .where({
        ownerOpenid: openid,
        status: _.neq('deleted'),
      })
      .orderBy('updatedAt', 'desc')
      .limit(20)
      .get()

    const petSpaces = await ensurePetIdentities(result.data || [])
    await attachPetImageUrls(petSpaces)

    return {
      ok: true,
      petSpaces,
    }
  } catch (error) {
    if (isCollectionNotFound(error)) {
      return {
        ok: true,
        petSpaces: [],
      }
    }

    return {
      ok: false,
      message: error.message || error.errMsg || '读取宠物小窝失败',
      petSpaces: [],
    }
  }
}

async function attachPetImageUrls(petSpaces) {
  const fileIds = [...new Set(petSpaces.flatMap((item) => [item.avatarFileId, item.coverFileId]).filter(Boolean))]

  if (!fileIds.length) {
    return
  }

  const urlResult = await cloud.getTempFileURL({ fileList: fileIds }).catch(() => ({ fileList: [] }))
  const urlMap = (urlResult.fileList || []).reduce((map, item) => {
    if (item.fileID && item.tempFileURL) {
      map[item.fileID] = item.tempFileURL
    }
    return map
  }, {})

  petSpaces.forEach((item) => {
    item.avatarTempUrl = urlMap[item.avatarFileId] || item.avatarUrl || ''
    item.coverTempUrl = urlMap[item.coverFileId] || item.coverUrl || item.avatarTempUrl || ''
  })
}

async function ensurePetIdentities(petSpaces) {
  const missing = petSpaces.filter((item) => !item.identityNo || !item.identityToken)

  if (!missing.length) {
    return petSpaces
  }

  await Promise.all(missing.map(async (item) => {
    const identity = await generatePetIdentity()
    const nfc = item.nfc || {
      status: 'unbound',
      tagId: '',
      boundAt: null,
    }

    await db.collection('pet_spaces').doc(item._id).update({
      data: {
        identityNo: identity.identityNo,
        identityCode: identity.identityCode,
        identityYear: identity.identityYear,
        identityToken: identity.identityToken,
        identityStatus: item.identityStatus || 'active',
        identityCreatedAt: item.identityCreatedAt || db.serverDate(),
        nfc,
        updatedAt: db.serverDate(),
      },
    })

    Object.assign(item, {
      identityNo: identity.identityNo,
      identityCode: identity.identityCode,
      identityYear: identity.identityYear,
      identityToken: identity.identityToken,
      identityStatus: item.identityStatus || 'active',
      identityCreatedAt: item.identityCreatedAt || '',
      nfc,
    })
  }))

  return petSpaces
}

async function generatePetIdentity() {
  const identityYear = new Date().getFullYear()
  const maxAttempts = 20

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const identityCode = generateSixDigitCode()
    const identityNo = `XC-${identityYear}-${identityCode}`
    const identityToken = generateIdentityToken()
    const existing = await db.collection('pet_spaces').where({ identityNo }).limit(1).get()
    const existingToken = await db.collection('pet_spaces').where({ identityToken }).limit(1).get()

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

function isCollectionNotFound(error = {}) {
  const message = `${error.errCode || ''} ${error.errMsg || ''} ${error.message || ''}`
  return message.includes('-502005') || message.includes('collection not exist')
}
