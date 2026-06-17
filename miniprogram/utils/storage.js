// Storage provider entry point. Currently the project only ships the qiniu
// provider; tencent-cos will be added later by extending the config and adding
// a sibling implementation.
//
// CDN_HOST and KEY_PREFIX are also exported for static-asset usage via
// assetUrl(path). Keep this file the single source for those constants so
// switching CDN means editing one line.

const auth = require('./auth')

const CDN_HOST = 'https://qiniu.cdn.cl8023.com'
const KEY_PREFIX = 'project/star-pet'

const config = {
  provider: 'qiniu',
  bucket: 'cl8023',
  region: 'z2',
  uploadUrl: 'https://upload-z2.qiniup.com',
  cdnHost: CDN_HOST,
  keyPrefix: `${KEY_PREFIX}/uploads`,
}

// Builds a CDN url for a static asset under {KEY_PREFIX}/assets/...
// Usage: assetUrl('themes/cloud-garden.png') ->
//   https://qiniu.cdn.cl8023.com/project/star-pet/assets/themes/cloud-garden.png
function assetUrl(relativePath) {
  if (!relativePath) return ''
  const clean = String(relativePath).replace(/^\/+/, '')
  return `${CDN_HOST}/${KEY_PREFIX}/assets/${clean}`
}

const MEMORIAL_HOME_THEME_COUNT = 4

function paddedThemeNo(index) {
  return String(index).padStart(2, '0')
}

function memorialThemeId(index) {
  return `memorial_home_bg_${paddedThemeNo(index)}`
}

function memorialThemeImage(index) {
  return assetUrl(`themes/${memorialThemeId(index)}.png`)
}

function memorialThemePreview(index) {
  return assetUrl(`themes/${memorialThemeId(index)}_preview.png`)
}

const memorialHomeThemeLayouts = {
  memorial_home_bg_01: {
    aspectRatio: 853 / 1844,
    heroHeight: 1620,
    avatar: { left: 30.2, top: 10.6, width: 37.6 },
    info: { top: 36 },
    actions: { top: 52 },
    contentOffset: 730,
  },
  memorial_home_bg_02: {
    aspectRatio: 853 / 1844,
    heroHeight: 1620,
    avatar: { left: 30.6, top: 15.6, width: 40 },
    info: { top: 39 },
    actions: { top: 58 },
    contentOffset: 680,
  },
  memorial_home_bg_03: {
    aspectRatio: 853 / 1844,
    heroHeight: 1620,
    avatar: { left: 34.2, top: 20.6, width: 33.6 },
    info: { top: 48.2 },
    actions: { top: 63.5 },
    contentOffset: 530,
  },
  memorial_home_bg_04: {
    tone: 'dark',
    aspectRatio: 853 / 1844,
    heroHeight: 1620,
    avatar: { left: 33.8, top: 19.2, width: 33.4 },
    info: { top: 48.8 },
    actions: { top: 63.8 },
    contentOffset: 530,
  },
}

const classicThemeOptions = [
  { id: 'cloud', name: '梦幻花谷', image: assetUrl('themes/cloud-garden.png') },
  { id: 'rainbow', name: '日落花海', image: assetUrl('themes/sunset-flowers.png') },
  { id: 'starry', name: '星空晨曦', image: assetUrl('themes/starry-sky.png') },
  { id: 'sakura', name: '樱花大道', image: assetUrl('themes/sakura-avenue.png') },
]

const memorialHomeThemes = []
for (let index = 1; index <= MEMORIAL_HOME_THEME_COUNT; index += 1) {
  memorialHomeThemes.push({
    id: memorialThemeId(index),
    name: `纪念馆 ${paddedThemeNo(index)}`,
    image: memorialThemePreview(index),
    background: memorialThemeImage(index),
    layout: memorialHomeThemeLayouts[memorialThemeId(index)] || memorialHomeThemeLayouts.memorial_home_bg_01,
  })
}

// Theme background images shared across home/identity/timeline/pet-detail/
// pet-create/pet-edit. Keep keys aligned with pet.theme enum.
const themeImages = {
  cloud: assetUrl('themes/cloud-garden.png'),
  rainbow: assetUrl('themes/sunset-flowers.png'),
  starry: assetUrl('themes/starry-sky.png'),
  sakura: assetUrl('themes/sakura-avenue.png'),
}

memorialHomeThemes.forEach((theme) => {
  themeImages[theme.id] = theme.background
})

const memorialHomeThemeIds = memorialHomeThemes.map((theme) => theme.id)

function isMemorialHomeTheme(theme) {
  return memorialHomeThemeIds.includes(theme)
}

function getThemeOptionsForLifeStatus(lifeStatus) {
  return lifeStatus === 'in_stars' ? memorialHomeThemes : classicThemeOptions
}

function resolveThemeForLifeStatus(theme, lifeStatus) {
  const options = getThemeOptionsForLifeStatus(lifeStatus)
  if (options.some((item) => item.id === theme)) {
    return theme
  }
  return options[0] ? options[0].id : ''
}

function getMemorialHomeTheme(theme) {
  return memorialHomeThemes.find((item) => item.id === theme) || memorialHomeThemes[0] || null
}

const defaultPetImage = assetUrl('images/default-pet.jpg')

const SUPPORTED_TYPES = ['avatar', 'petCover', 'petAlbum', 'memory']

// Uploads a cropped local file path to the configured storage provider and
// returns { ref, url } for immediate UI updates and later persistence.
async function uploadImage({ type, petSpaceId, petUploadGrant, filePath, ext = 'jpg' } = {}) {
  if (!SUPPORTED_TYPES.includes(type)) {
    throw new Error(`unsupported image type: ${type}`)
  }
  if (!filePath) {
    throw new Error('filePath is required')
  }

  if (config.provider === 'qiniu') {
    return uploadToQiniu({ type, petSpaceId, petUploadGrant, filePath, ext })
  }

  throw new Error(`unsupported storage provider: ${config.provider}`)
}

// Builds a CDN url from a Ref or a bare key string. Useful for echoing locally
// just-uploaded images without waiting for a server roundtrip.
function buildUrl(refOrKey) {
  if (!refOrKey) {
    return ''
  }
  const key = typeof refOrKey === 'string' ? refOrKey : refOrKey.key
  return key ? `${config.cdnHost}/${key}` : ''
}

// Asks the cloud function for a scoped upload token, then PUTs the cropped
// temp file straight to qiniu via wx.uploadFile.
async function uploadToQiniu({ type, petSpaceId, petUploadGrant, filePath, ext }) {
  let result = await requestQiniuUploadToken({ type, petSpaceId, petUploadGrant, ext })

  if (isGrantExpiredResult(result)) {
    await auth.refreshSessionGrant()
    result = await requestQiniuUploadToken({ type, petSpaceId, petUploadGrant, ext })
  }

  if (!result || !result.ok) {
    throw new Error(normalizeUploadTokenMessage((result && result.message) || '获取上传凭证失败'))
  }

  const { uploadToken, key, ref, url } = result
  if (!uploadToken || !key || !ref) {
    throw new Error('上传凭证不完整')
  }

  await wxUploadFile({
    url: config.uploadUrl,
    filePath,
    name: 'file',
    formData: {
      token: uploadToken,
      key,
    },
  })

  return {
    ref,
    url: url || buildUrl(ref),
  }
}

async function requestQiniuUploadToken({ type, petSpaceId, petUploadGrant, ext }) {
  const sessionGrant = auth.getSessionGrant()
  if (!sessionGrant) {
    throw new Error('登录态已失效，请重新登录')
  }

  const { result } = await wx.cloud.callFunction({
    name: 'getQiniuUploadToken',
    data: {
      type,
      petSpaceId: petSpaceId || '',
      petUploadGrant: petUploadGrant || '',
      sessionGrant,
      ext,
    },
  })

  return result
}

function isGrantExpiredResult(result) {
  const message = (result && result.message) || ''
  return message.includes('grant 已过期') || message.includes('登录态已失效') || message.includes('登录已过期')
}

function normalizeUploadTokenMessage(message = '') {
  if (
    message.includes('grant 无效')
    || message.includes('grant 签名无效')
    || message.includes('上传授权无效')
    || message.includes('上传授权已失效')
  ) {
    return '上传授权已失效，请重新进入后再试'
  }

  if (message.includes('grant 已过期') || message.includes('登录态已失效') || message.includes('登录已过期')) {
    return '登录状态已过期，请重新登录后再试'
  }

  return message || '获取上传凭证失败'
}

async function cleanupRefs(refs = []) {
  const sessionGrant = auth.getSessionGrant()
  if (!sessionGrant || !Array.isArray(refs) || !refs.length) {
    return { ok: true, deleted: { successCount: 0, failCount: 0, failedKeys: [] } }
  }

  const { result } = await wx.cloud.callFunction({
    name: 'cleanupRefs',
    data: {
      sessionGrant,
      refs,
    },
  })

  if (!result || !result.ok) {
    throw new Error((result && result.message) || '清理上传文件失败')
  }

  return result
}

function wxUploadFile(options) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      ...options,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res)
          return
        }
        reject(new Error(parseQiniuError(res) || `上传失败 (${res.statusCode})`))
      },
      fail: (error) => {
        reject(new Error((error && error.errMsg) || '上传失败'))
      },
    })
  })
}

function parseQiniuError(res) {
  if (!res || !res.data) {
    return ''
  }
  try {
    const payload = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
    return payload.error || payload.message || ''
  } catch (error) {
    return typeof res.data === 'string' ? res.data : ''
  }
}

module.exports = {
  uploadImage,
  cleanupRefs,
  buildUrl,
  assetUrl,
  themeImages,
  classicThemeOptions,
  memorialHomeThemes,
  memorialHomeThemeIds,
  isMemorialHomeTheme,
  getThemeOptionsForLifeStatus,
  resolveThemeForLifeStatus,
  getMemorialHomeTheme,
  defaultPetImage,
  config,
  CDN_HOST,
  KEY_PREFIX,
}
