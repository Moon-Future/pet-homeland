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

// Theme background images shared across home/identity/timeline/pet-detail/
// pet-create/pet-edit. Keep keys aligned with pet.theme enum.
const themeImages = {
  cloud: assetUrl('themes/cloud-garden.png'),
  rainbow: assetUrl('themes/sunset-flowers.png'),
  starry: assetUrl('themes/starry-sky.png'),
  sakura: assetUrl('themes/sakura-avenue.png'),
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
    throw new Error((result && result.message) || '获取上传凭证失败')
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
  defaultPetImage,
  config,
  CDN_HOST,
  KEY_PREFIX,
}
