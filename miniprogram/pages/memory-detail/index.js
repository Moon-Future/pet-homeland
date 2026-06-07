const auth = require('../../utils/auth')

const typeLabels = {
  daily: '日常',
  growth: '成长',
  health: '健康',
  travel: '旅行',
  birthday: '生日',
}

Page({
  data: {
    petSpaceId: '',
    memoryId: '',
    loading: false,
    memory: null,
    isOwner: false,
    dirtyVersion: 0,
  },

  onLoad(options = {}) {
    this.setData({
      petSpaceId: options.petSpaceId || '',
      memoryId: options.memoryId || '',
      dirtyVersion: this.getDirtyVersion(),
    })
    this.loadMemory()
  },

  onShow() {
    const dirtyVersion = this.getDirtyVersion()
    if (this.data.memoryId && dirtyVersion !== this.data.dirtyVersion) {
      this.setData({ dirtyVersion })
      this.loadMemory()
    }
  },

  async loadMemory() {
    if (!this.data.memoryId || this.data.loading) {
      return
    }

    this.setData({ loading: true })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getMemories',
        data: {
          memoryId: this.data.memoryId,
          limit: 1,
        },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '读取详情失败')
      }

      const raw = (result.memories || [])[0]
      if (!raw) {
        throw new Error('这条记录不存在')
      }

      this.setData({
        loading: false,
        dirtyVersion: this.getDirtyVersion(),
        petSpaceId: raw.petSpaceId || this.data.petSpaceId,
        isOwner: raw.ownerOpenid === ((auth.getUserProfile() || {}).openid),
        memory: this.normalizeMemory(raw),
      })
    } catch (error) {
      this.setData({ loading: false, memory: null })
      wx.showToast({
        title: error.message || '读取详情失败',
        icon: 'none',
      })
    }
  },

  normalizeMemory(item = {}) {
    return {
      id: item._id,
      title: item.title || '今天的记录',
      content: item.content || '这一天留下了这些照片。',
      memoryDate: item.memoryDate || '',
      dateText: this.formatDate(item.memoryDate || ''),
      typeLabel: typeLabels[item.type] || '日常',
      mediaUrls: item.mediaUrls || [],
      reviewStatus: item.reviewStatus || 'not_required',
      hiddenReason: item.hiddenReason || '',
      reviewNotice: this.getReviewNotice(item),
    }
  },

  getReviewNotice(item = {}) {
    const reviewStatus = item.reviewStatus || 'not_required'
    const noticeByStatus = {
      not_required: null,
      pending_review: { type: 'pending', text: '这条记录审核中，通过后访客可见。' },
      approved: { type: 'approved', text: '这条记录已通过审核。' },
      rejected: { type: 'rejected', text: '这条记录未通过审核，可修改后重新提交。' },
      hidden: { type: 'hidden', text: '这条记录已被管理员隐藏，可修改后重新提交。' },
    }

    return noticeByStatus[reviewStatus] || null
  },

  formatDate(dateText) {
    const parts = dateText.split('-')
    if (parts.length !== 3) {
      return '日期待补充'
    }

    return `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url
    if (!url || !this.data.memory) {
      return
    }

    wx.previewImage({
      current: url,
      urls: this.data.memory.mediaUrls,
    })
  },

  goEdit() {
    if (!this.data.memoryId || !this.data.isOwner) {
      return
    }

    wx.navigateTo({
      url: `/pages/memory-create/index?petSpaceId=${this.data.petSpaceId}&memoryId=${this.data.memoryId}`,
    })
  },

  getDirtyVersion() {
    return Number(wx.getStorageSync('memoryListDirty') || 0)
  },
})
