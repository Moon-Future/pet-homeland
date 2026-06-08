function getUserProfile() {
  const app = getApp()
  return (app.globalData && app.globalData.userProfile) || wx.getStorageSync('userProfile')
}

function getSessionGrant() {
  const user = getUserProfile()
  return (user && user.sessionGrant) || ''
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
}
