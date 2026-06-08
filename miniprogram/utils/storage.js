// Storage provider entry point. Currently the project only ships the qiniu
// provider; tencent-cos will be added later by extending the config and adding
// a sibling implementation.

const config = {
  provider: 'qiniu',
  bucket: 'cl8023',
  region: 'z2',
  uploadUrl: 'https://upload-z2.qiniup.com',
  cdnHost: 'https://qiniu.cdn.cl8023.com',
  keyPrefix: 'project/star-pet-village/uploads',
}

const SUPPORTED_TYPES = ['avatar', 'petCover', 'petAlbum', 'memory']

// Uploads a cropped local file path to the configured storage provider and
// returns a Ref ({ storage, bucket, key }). Url is intentionally not part of
// the Ref because it can always be reconstructed via buildUrl().
async function uploadImage({ type, petSpaceId, filePath } = {}) {
  if (!SUPPORTED_TYPES.includes(type)) {
    throw new Error(`unsupported image type: ${type}`)
  }
  if (!filePath) {
    throw new Error('filePath is required')
  }

  if (config.provider === 'qiniu') {
    return uploadToQiniu({ type, petSpaceId, filePath })
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
async function uploadToQiniu({ type, petSpaceId, filePath }) {
  const { result } = await wx.cloud.callFunction({
    name: 'getQiniuUploadToken',
    data: {
      type,
      petSpaceId: petSpaceId || '',
    },
  })

  if (!result || !result.ok) {
    throw new Error((result && result.message) || '获取上传凭证失败')
  }

  const { uploadToken, key } = result
  if (!uploadToken || !key) {
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
    storage: config.provider,
    bucket: config.bucket,
    key,
  }
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
  buildUrl,
  config,
}
