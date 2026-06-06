const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const allowedTypes = ['feature', 'bug', 'data', 'other']

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext()
  const feedback = sanitizeFeedback(event.feedback)

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态' }
  }

  if (!feedback.content) {
    return { ok: false, message: '请填写反馈内容' }
  }

  const security = await checkFeedbackSecurity(openid, feedback)
  if (!security.ok) {
    return security
  }

  try {
    await ensureCollection('feedbacks')
    const added = await db.collection('feedbacks').add({
      data: {
        openid,
        type: feedback.type,
        content: feedback.content,
        contact: feedback.contact,
        status: 'open',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    })

    return {
      ok: true,
      id: added._id,
    }
  } catch (error) {
    return {
      ok: false,
      message: error.message || error.errMsg || '提交反馈失败',
    }
  }
}

function sanitizeFeedback(feedback = {}) {
  return {
    type: allowedTypes.includes(feedback.type) ? feedback.type : 'other',
    content: sanitizeString(feedback.content, 500),
    contact: sanitizeString(feedback.contact, 64),
  }
}

async function checkFeedbackSecurity(openid, feedback) {
  try {
    const { result } = await cloud.callFunction({
      name: 'checkContentSecurity',
      data: {
        openid,
        texts: [
          { field: 'content', content: feedback.content, message: '反馈内容未通过安全校验' },
          { field: 'contact', content: feedback.contact, message: '联系方式未通过安全校验' },
        ],
        fileIds: [],
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
