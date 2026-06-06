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
  const action = allowValue(event.action, ['hide', 'restore', 'unpublish'], 'hide')
  const reason = sanitizeString(event.reason, 160)

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态' }
  }

  if (!targetType || !targetId) {
    return { ok: false, message: '缺少处理目标' }
  }

  const collection = targetType === 'pet_space' ? 'pet_spaces' : 'memories'
  const current = await db.collection(collection).doc(targetId).get()
  const item = current.data
  if (!item || item.status === 'deleted') {
    return { ok: false, message: '内容不存在' }
  }

  const isAdmin = Boolean(await getAdmin(openid))
  const isOwner = item.ownerOpenid === openid

  if (action === 'unpublish') {
    if (targetType !== 'pet_space' || !isOwner) {
      return { ok: false, message: '只有小窝主人可以下架公开展示' }
    }

    await db.collection('pet_spaces').doc(targetId).update({
      data: {
        visibility: 'private',
        reviewStatus: 'approved',
        hiddenReason: reason || '主人下架公开展示',
        hiddenAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    })

    return { ok: true }
  }

  if (!isAdmin) {
    return { ok: false, message: '无管理员权限' }
  }

  if (action === 'restore') {
    await db.collection(collection).doc(targetId).update({
      data: {
        status: 'active',
        reviewStatus: 'approved',
        hiddenReason: '',
        hiddenAt: null,
        updatedAt: db.serverDate(),
      },
    })

    if (targetType === 'memory') {
      await db.collection('media').where({ memoryId: targetId }).update({
        data: { status: 'active' },
      }).catch(() => {})
    }

    return { ok: true }
  }

  await db.collection(collection).doc(targetId).update({
    data: {
      status: 'hidden',
      reviewStatus: 'hidden',
      hiddenReason: reason || '管理员隐藏',
      hiddenBy: openid,
      hiddenAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  })

  if (targetType === 'memory') {
    await db.collection('media').where({ memoryId: targetId }).update({
      data: { status: 'blocked' },
    }).catch(() => {})
  }

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
