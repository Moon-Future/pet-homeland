const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const textScene = 2
const CDN_HOST = 'https://qiniu.cdn.cl8023.com'

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const openid = OPENID || sanitizeString(event.openid, 128)
  const texts = Array.isArray(event.texts) ? event.texts : []
  const refs = Array.isArray(event.refs) ? event.refs : []

  try {
    for (const item of texts) {
      const content = sanitizeString(item.content, item.maxLength || 1000)
      if (!content) {
        continue
      }

      const result = await checkText(content, openid)
      if (!result.ok) {
        return {
          ok: false,
          kind: 'text',
          field: item.field || '',
          message: item.message || result.message || '文字内容未通过安全校验',
        }
      }
    }

    for (const item of refs) {
      const ref = normalizeRef(typeof item === 'object' && item.ref ? item.ref : item)
      if (!ref) {
        continue
      }

      const result = await checkImage(ref)
      if (!result.ok) {
        return {
          ok: false,
          kind: 'image',
          key: ref.key,
          message: (typeof item === 'object' && item.message) || result.message || '图片内容未通过安全校验',
        }
      }
    }

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      kind: 'system',
      message: isOpenapiPermissionError(error)
        ? '内容安全云函数缺少 OpenAPI 权限，请重新上传部署 checkContentSecurity 云函数并确认 config.json 已生效'
        : error.message || error.errMsg || '内容安全校验失败，请稍后重试',
    }
  }
}

async function checkText(content, openid) {
  try {
    const result = await cloud.openapi.security.msgSecCheck({
      content,
      version: 2,
      scene: textScene,
      openid,
    })

    if (result && result.errCode && result.errCode !== 0) {
      return { ok: false, message: getSecurityMessage(result) }
    }

    return { ok: true }
  } catch (error) {
    if (isSecurityReject(error)) {
      return { ok: false, message: '文字内容未通过安全校验' }
    }

    throw error
  }
}

async function checkImage(ref) {
  try {
    const buffer = await downloadObject(ref)

    if (!buffer || !buffer.length) {
      return { ok: false, message: '图片读取失败，请重新上传' }
    }

    const result = await cloud.openapi.security.imgSecCheck({
      media: {
        contentType: getImageContentType(ref.key),
        value: buffer,
      },
    })

    if (result && result.errCode && result.errCode !== 0) {
      return { ok: false, message: getSecurityMessage(result) }
    }

    return { ok: true }
  } catch (error) {
    if (isSecurityReject(error)) {
      return { ok: false, message: '图片内容未通过安全校验' }
    }

    throw error
  }
}

function downloadObject(ref) {
  return new Promise((resolve, reject) => {
    const url = `${CDN_HOST}/${ref.key}`
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`download failed: ${res.statusCode}`))
          return
        }

        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      })
      .on('error', reject)
  })
}

function normalizeRef(value) {
  if (!value || typeof value !== 'object') {
    return null
  }
  const key = sanitizeString(value.key, 512)
  if (!key) {
    return null
  }
  return {
    storage: sanitizeString(value.storage, 32) || 'qiniu',
    bucket: sanitizeString(value.bucket, 64) || 'cl8023',
    key,
  }
}

function getImageContentType(key) {
  const lower = (key || '').toLowerCase()
  if (lower.endsWith('.png')) {
    return 'image/png'
  }
  if (lower.endsWith('.webp')) {
    return 'image/webp'
  }
  return 'image/jpeg'
}

function getSecurityMessage(result = {}) {
  if (result.errCode === 87014 || result.errcode === 87014) {
    return '内容未通过安全校验，请调整后再提交'
  }
  return result.errMsg || result.errmsg || '内容安全校验未通过'
}

function isSecurityReject(error = {}) {
  const text = `${error.errCode || error.errcode || ''} ${error.errMsg || error.errmsg || ''} ${error.message || ''}`
  return text.includes('87014') || text.toLowerCase().includes('risky')
}

function isOpenapiPermissionError(error = {}) {
  const text = `${error.errCode || error.errcode || ''} ${error.errMsg || error.errmsg || ''} ${error.message || ''}`
  return text.includes('-604101') || text.toLowerCase().includes('no permission to call this api')
}

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().slice(0, maxLength)
}
