const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext()
  const reportId = sanitizeString(event.reportId, 64)
  const resolution = sanitizeString(event.resolution, 160) || '已处理'

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态' }
  }

  const admin = await getAdmin(openid)
  if (!admin) {
    return { ok: false, message: '无管理员权限' }
  }

  if (!reportId) {
    return { ok: false, message: '缺少举报记录' }
  }

  await db.collection('reports').doc(reportId).update({
    data: {
      status: 'resolved',
      resolution,
      resolvedBy: openid,
      resolvedAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  })

  return { ok: true }
}

async function getAdmin(openid) {
  await ensureCollection('users')
  const result = await db.collection('users').where({ openid, role: 'admin', status: _.neq('deleted') }).limit(1).get()
  return (result.data || [])[0] || null
}

async function ensureCollection(name) {
  try {
    await db.collection(name).limit(1).get()
  } catch (error) {
    if (!isCollectionNotFound(error)) {
      throw error
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

function getErrorText(error = {}) {
  return `${error.errCode || ''} ${error.errMsg || ''} ${error.message || ''}`
}
