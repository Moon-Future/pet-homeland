const auth = require('../../utils/auth')

Page({
  data: {
    loading: false,
    notices: [],
  },

  onLoad() {
    if (!auth.requireLogin({ redirectToProfile: true })) {
      return
    }

    this.loadNotices()
  },

  async loadNotices() {
    if (this.data.loading) {
      return
    }

    this.setData({ loading: true })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getReviewNotices',
        data: {},
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '读取审核通知失败')
      }

      this.setData({
        loading: false,
        notices: (result.notices || []).map(this.normalizeNotice),
      })
    } catch (error) {
      this.setData({ loading: false, notices: [] })
      wx.showToast({ title: error.message || '读取审核通知失败', icon: 'none' })
    }
  },

  normalizeNotice(item = {}) {
    return {
      ...item,
      typeText: item.targetType === 'memory' ? '回忆' : '小窝',
      statusClass: item.status || 'approved',
    }
  },

  openNotice(e) {
    const notice = this.data.notices.find((item) => item.id === e.currentTarget.dataset.id)
    if (!notice) {
      return
    }

    if (notice.targetType === 'memory') {
      wx.navigateTo({
        url: `/pages/memory-detail/index?petSpaceId=${notice.petSpaceId || ''}&memoryId=${notice.targetId}`,
      })
      return
    }

    wx.setStorageSync('selectedPetSpaceId', notice.targetId)
    wx.removeStorageSync('viewPetSpaceId')
    wx.removeStorageSync('viewSource')
    wx.switchTab({ url: '/pages/pet-detail/index' })
  },
})
