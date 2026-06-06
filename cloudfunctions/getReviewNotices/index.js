const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

const db = cloud.database()
const _ = db.command

exports.main = async () => {
  const { OPENID: openid } = cloud.getWXContext()

  if (!openid) {
    return { ok: false, message: '无法获取微信登录态', notices: [] }
  }

  try {
    const [petResult, memoryResult] = await Promise.all([
      db.collection('pet_spaces')
        .where({
          ownerOpenid: openid,
          status: _.neq('deleted'),
        })
        .orderBy('updatedAt', 'desc')
        .limit(50)
        .get(),
      db.collection('memories')
        .where({
          ownerOpenid: openid,
          status: _.neq('deleted'),
        })
        .orderBy('updatedAt', 'desc')
        .limit(80)
        .get(),
    ])

    const petNotices = (petResult.data || [])
      .filter((item) => item.visibility === 'discover' || ['pending_review', 'rejected', 'hidden'].includes(item.reviewStatus))
      .map((item) => normalizePetNotice(item))
    const memoryNotices = (memoryResult.data || [])
      .filter((item) => item.reviewedAt || ['pending_review', 'rejected', 'hidden'].includes(item.reviewStatus))
      .map((item) => normalizeMemoryNotice(item))

    const notices = [...petNotices, ...memoryNotices]
      .sort((a, b) => getTime(b.updatedAt) - getTime(a.updatedAt))
      .slice(0, 80)

    return { ok: true, notices }
  } catch (error) {
    if (isCollectionNotFound(error)) {
      return { ok: true, notices: [] }
    }

    return {
      ok: false,
      message: error.message || error.errMsg || '读取审核通知失败',
      notices: [],
    }
  }
}

function normalizePetNotice(item = {}) {
  return {
    id: item._id,
    targetType: 'pet_space',
    targetId: item._id,
    title: item.petName || '未命名小窝',
    status: item.reviewStatus || 'approved',
    statusText: getStatusText(item.reviewStatus || 'approved'),
    desc: getPetDesc(item),
    petSpaceId: item._id,
    updatedAt: item.updatedAt || item.createdAt || '',
  }
}

function normalizeMemoryNotice(item = {}) {
  return {
    id: item._id,
    targetType: 'memory',
    targetId: item._id,
    title: item.title || '今天的记录',
    status: item.reviewStatus || 'approved',
    statusText: getStatusText(item.reviewStatus || 'approved'),
    desc: getMemoryDesc(item),
    petSpaceId: item.petSpaceId || '',
    updatedAt: item.updatedAt || item.createdAt || '',
  }
}

function getMemoryDesc(item = {}) {
  if (item.reviewStatus === 'pending_review') {
    return '这条记录审核中，通过后访客可见'
  }
  if (item.reviewStatus === 'rejected') {
    return item.hiddenReason || '这条记录未通过审核，可修改后重新提交'
  }
  if (item.reviewStatus === 'hidden') {
    return item.hiddenReason || '这条记录已被管理员隐藏'
  }
  return '这条记录已通过审核'
}

function getPetDesc(item = {}) {
  if (item.reviewStatus === 'pending_review') {
    return '公开展示审核中，通过后会出现在星空广场'
  }
  if (item.reviewStatus === 'rejected') {
    return item.hiddenReason || '公开展示未通过审核，可修改后重新提交'
  }
  if (item.reviewStatus === 'hidden') {
    return item.hiddenReason || '公开展示已被管理员隐藏'
  }
  return '公开展示已通过审核'
}

function getStatusText(status) {
  const textByStatus = {
    pending_review: '审核中',
    approved: '已通过',
    rejected: '未通过',
    hidden: '已隐藏',
  }

  return textByStatus[status] || '已通过'
}

function getTime(value) {
  if (!value) {
    return 0
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

function isCollectionNotFound(error = {}) {
  const message = `${error.errCode || ''} ${error.errMsg || ''} ${error.message || ''}`
  return message.includes('-502005') || message.includes('collection not exist')
}
