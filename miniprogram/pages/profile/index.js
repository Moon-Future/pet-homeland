const storage = require('../../utils/storage')
const auth = require('../../utils/auth')

const defaultAvatar = storage.assetUrl('images/user-default-avatar.png')

Page({
  data: {
    loading: false,
    loggingIn: false,
    isLoggedIn: false,
    hasProfile: false,
    user: {
      nickname: '',
      avatarUrl: defaultAvatar,
      vip: false,
      createdAtText: '',
    },
    isAdmin: false,
    stats: [
      { label: '宠物', value: 0 },
      { label: '回忆', value: 0 },
      { label: '相册', value: 0 },
      { label: '分享', value: 0 },
    ],
    services: [
      { label: '我的宠物', icon: '/assets/icons/paw.svg', url: '/pages/pet-list/index' },
      { label: '资料设置', icon: '/assets/icons/settings.svg', url: '/pages/profile-edit/index' },
    ],
    more: [],
  },

  onLoad() {
    this.loadCachedProfile()
  },

  onShow() {
    this.loadCachedProfile()
  },

  loadCachedProfile() {
    const user = auth.getUserProfile()
    if (!user || !user.openid) {
      this.setData({
        loading: false,
        isLoggedIn: false,
        hasProfile: false,
        user: this.normalizeUser({}),
        stats: this.normalizeStats(),
        isAdmin: false,
        more: this.buildMore(false),
      })
      return
    }

    const normalizedUser = this.normalizeUser(user)
    const isAdmin = normalizedUser.role === 'admin'
    this.setData({
      loading: false,
      isLoggedIn: true,
      hasProfile: Boolean(normalizedUser.nickname),
      user: normalizedUser,
      stats: this.normalizeStats(normalizedUser.stats),
      isAdmin,
      more: this.buildMore(isAdmin),
    })
  },

  async loginByAvatar() {
    if (!wx.cloud) {
      wx.showToast({ title: '请先开通云开发', icon: 'none' })
      return
    }

    if (this.data.loggingIn) {
      return
    }

    this.setData({ loggingIn: true })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'login',
        data: {},
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '登录失败')
      }

      const user = this.normalizeUser(result.user)
      const hasProfile = Boolean(user.nickname)
      getApp().globalData.userProfile = user
      wx.setStorageSync('userProfile', user)

      this.setData({
        loggingIn: false,
        isLoggedIn: true,
        hasProfile,
        user,
        stats: this.normalizeStats(user.stats),
        isAdmin: user.role === 'admin',
        more: this.buildMore(user.role === 'admin'),
      })

      wx.showToast({
        title: hasProfile ? '已登录' : '登录成功',
        icon: 'success',
      })
    } catch (error) {
      this.setData({ loggingIn: false })
      wx.showToast({
        title: error.message || '登录失败，请稍后重试',
        icon: 'none',
      })
    }
  },

  normalizeUser(user = {}) {
    const createdAt = user.createdAt || user.updatedAt

    return {
      ...user,
      nickname: user.nickname || '',
      avatarUrl: user.avatarUrl || defaultAvatar,
      vip: Boolean(user.vip),
      createdAtText: this.formatDate(createdAt),
    }
  },

  normalizeStats(stats = {}) {
    return [
      { label: '宠物', value: stats.petCount || 0 },
      { label: '回忆', value: stats.memoryCount || 0 },
      { label: '相册', value: stats.mediaCount || 0 },
      { label: '分享', value: stats.shareCount || 0 },
    ]
  },

  buildMore(isAdmin) {
    const items = [
      { label: '数据概览', icon: '/assets/icons/star.svg', url: '/pages/data-overview/index' },
      { label: '意见反馈', icon: '/assets/icons/share.svg', url: '/pages/feedback/index' },
    ]

    if (isAdmin) {
      items.push({ label: '人工审核', icon: '/assets/icons/settings.svg', url: '/pages/admin-review/index' })
    }

    items.push({ label: '分享给好友', icon: '/assets/icons/heart.svg', type: 'share' })
    return items
  },

  formatDate(value) {
    if (!value) {
      return '已登录'
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return '已登录'
    }

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${year}.${month}.${day} 加入星宠乡`
  },

  goEditProfile() {
    if (!auth.requireLogin()) {
      return
    }

    wx.navigateTo({
      url: '/pages/profile-edit/index',
    })
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后将不再展示你的用户资料，需要重新点击头像登录。',
      confirmText: '退出',
      confirmColor: '#8b5cf6',
      success: (res) => {
        if (!res.confirm) {
          return
        }

        auth.clearLogin()
        this.setData({
          isLoggedIn: false,
          hasProfile: false,
          user: this.normalizeUser({}),
          stats: this.normalizeStats(),
          isAdmin: false,
          more: this.buildMore(false),
        })

        wx.showToast({
          title: '已退出登录',
          icon: 'none',
        })
      },
    })
  },

  go(e) {
    const { url, type } = e.currentTarget.dataset
    if (type === 'share') {
      return
    }

    if (!url) {
      wx.showToast({ title: '功能下期开放', icon: 'none' })
      return
    }

    if (!auth.requireLogin()) {
      return
    }

    if (url === '/pages/pet-detail/index') {
      wx.switchTab({ url })
      return
    }

    wx.navigateTo({ url })
  },

  onShareAppMessage() {
    return {
      title: '星宠乡：记录陪伴，也安放心念',
      path: '/pages/index/index',
      imageUrl: '/assets/home/default-pet.png',
    }
  },
})
