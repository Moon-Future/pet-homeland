function getUserProfile() {
  const app = getApp()
  return (app.globalData && app.globalData.userProfile) || wx.getStorageSync('userProfile')
}

function getSessionGrant() {
  const user = getUserProfile()
  return (user && user.sessionGrant) || ''
}

async function refreshSessionGrant() {
  if (!wx.cloud) {
    throw new Error('请先开通云开发')
  }

  const { result } = await wx.cloud.callFunction({
    name: 'login',
    data: {},
  })

  if (!result || !result.ok) {
    throw new Error((result && result.message) || '登录已过期，请重新登录')
  }

  const app = getApp()
  const current = getUserProfile() || {}
  const user = {
    ...current,
    ...(result.user || {}),
    sessionGrant: result.sessionGrant || '',
  }

  if (!user.sessionGrant) {
    throw new Error('登录已过期，请重新登录')
  }

  if (app.globalData) {
    app.globalData.userProfile = user
  }
  wx.setStorageSync('userProfile', user)

  return user.sessionGrant
}

function isLoggedIn() {
  const user = getUserProfile()
  return Boolean(user && user.openid)
}

function requireLogin(options = {}) {
  if (isLoggedIn()) {
    return true
  }

  wx.showToast({
    title: options.message || '请先点击头像登录',
    icon: 'none',
  })

  if (options.redirectToProfile) {
    setTimeout(() => {
      wx.switchTab({
        url: '/pages/profile/index',
      })
    }, 450)
  }

  return false
}

function clearLogin() {
  const app = getApp()
  if (app.globalData) {
    app.globalData.userProfile = null
  }

  wx.removeStorageSync('userProfile')
}

module.exports = {
  clearLogin,
  getUserProfile,
  getSessionGrant,
  isLoggedIn,
  requireLogin,
  refreshSessionGrant,
}
