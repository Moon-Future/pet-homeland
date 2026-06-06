const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const textScene = 2

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const openid = OPENID || sanitizeString(event.openid, 128)
  const texts = Array.isArray(event.texts) ? event.texts : []
  const fileIds = Array.isArray(event.fileIds) ? event.fileIds : []

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

    for (const item of fileIds) {
      const fileId = sanitizeString(typeof item === 'string' ? item : item.fileId, 512)
      if (!fileId || !fileId.startsWith('cloud://')) {
        continue
      }

      const result = await checkImage(fileId)
      if (!result.ok) {
        return {
          ok: false,
          kind: 'image',
          fileId,
          message: (typeof item === 'object' && item.message) || result.message || '图片内容未通过安全校验',
        }
      }
    }

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      kind: 'system',
      message: error.message || error.errMsg || '内容安全校验失败，请稍后重试',
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

async function checkImage(fileId) {
  try {
    const file = await cloud.downloadFile({ fileID: fileId })
    const buffer = file.fileContent

    if (!buffer || !buffer.length) {
      return { ok: false, message: '图片读取失败，请重新上传' }
    }

    const result = await cloud.openapi.security.imgSecCheck({
      media: {
        contentType: getImageContentType(fileId),
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

function getImageContentType(fileId) {
  const lower = fileId.toLowerCase()
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

function sanitizeString(value, maxLength) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().slice(0, maxLength)
}
