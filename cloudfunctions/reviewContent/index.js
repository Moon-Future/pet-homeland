const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

exports.main = async (event = {}) => {
  const { OPENID: openid } = cloud.getWXContext()
  const targetType = allowValue(event.targetType, ['pet_space', 'memory'], '')
  const targetId = sanitizeString(event.targetId, 64)
  const action = allowValue(event.action, ['approve', 'reject'], '')
  const reason = sanitizeString(event.reason, 160)

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态' }
  }

  const admin = await getAdmin(openid)
  if (!admin) {
    return { ok: false, message: '无管理员权限' }
  }

  if (!targetType || !targetId || !action) {
    return { ok: false, message: '缺少审核目标或动作' }
  }

  const collection = targetType === 'pet_space' ? 'pet_spaces' : 'memories'
  const reviewStatus = action === 'approve' ? 'approved' : 'rejected'
  const data = {
    reviewStatus,
    reviewedBy: openid,
    reviewedAt: db.serverDate(),
    updatedAt: db.serverDate(),
  }

  if (action === 'reject') {
    data.hiddenReason = reason || '内容未通过审核'
  } else {
    data.hiddenReason = ''
    data.hiddenAt = null
  }

  await db.collection(collection).doc(targetId).update({ data })

  if (targetType === 'memory') {
    await db.collection('media').where({ memoryId: targetId }).update({
      data: {
        status: action === 'approve' ? 'active' : 'blocked',
      },
    }).catch(() => {})
  }

  return { ok: true, reviewStatus }
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

function allowValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback
}

function isCollectionNotFound(error) {
  const message = getErrorText(error)
  return message.includes('-502005') || message.includes('collection not exist')
}

function getErrorText(error = {}) {
  return `${error.errCode || ''} ${error.errMsg || ''} ${error.message || ''}`
}
