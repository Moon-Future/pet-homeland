const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext()
  const targetType = allowValue(event.targetType, ['pet_space', 'memory'], 'pet_space')
  const targetId = sanitizeString(event.targetId, 64)
  const reason = sanitizeString(event.reason, 80) || '内容不适合公开展示'
  const detail = sanitizeString(event.detail, 300)

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态' }
  }

  if (!targetId) {
    return { ok: false, message: '缺少举报对象' }
  }

  const security = await checkReportSecurity(openid, { reason, detail })
  if (!security.ok) {
    return security
  }

  await ensureCollection('reports')

  const existed = await db.collection('reports').where({
    reporterOpenid: openid,
    targetType,
    targetId,
    status: _.neq('resolved'),
  }).limit(1).get()

  if ((existed.data || []).length) {
    return { ok: true, message: '已收到你的举报' }
  }

  const now = db.serverDate()
  await db.collection('reports').add({
    data: {
      reporterOpenid: openid,
      targetType,
      targetId,
      reason,
      detail,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    },
  })

  if (targetType === 'pet_space') {
    await db.collection('pet_spaces').doc(targetId).update({
      data: {
        reportCount: _.inc(1),
        updatedAt: db.serverDate(),
      },
    }).catch(() => {})
  } else {
    await db.collection('memories').doc(targetId).update({
      data: {
        reportCount: _.inc(1),
        updatedAt: db.serverDate(),
      },
    }).catch(() => {})
  }

  return { ok: true, message: '已收到你的举报' }
}

async function ensureCollection(name) {
  try {
    await db.collection(name).limit(1).get()
  } catch (error) {
    if (!isCollectionNotFound(error)) {
      throw error
    }

    await db.createCollection(name).catch((createError) => {
      if (!isCollectionAlreadyExists(createError)) {
        throw createError
      }
    })
  }
}

async function checkReportSecurity(openid, report) {
  try {
    const { result } = await cloud.callFunction({
      name: 'checkContentSecurity',
      data: {
        openid,
        texts: [
          { field: 'reason', content: report.reason, message: '举报原因未通过安全校验' },
          { field: 'detail', content: report.detail, message: '举报说明未通过安全校验' },
        ],
        fileIds: [],
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
