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
    isAdminReviewer: false,
    source: '',
    dirtyVersion: 0,
  },

  onLoad(options = {}) {
    if (!auth.requireLogin({ redirectToProfile: true })) {
      return
    }

    this.setData({
      petSpaceId: options.petSpaceId || '',
      memoryId: options.memoryId || '',
      source: options.source || '',
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
          source: this.data.source,
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
        isAdminReviewer: Boolean(result.isAdmin),
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
      reviewStatus: item.reviewStatus || 'approved',
      hiddenReason: item.hiddenReason || '',
      reviewNotice: this.getReviewNotice(item),
    }
  },

  getReviewNotice(item = {}) {
    const reviewStatus = item.reviewStatus || 'approved'
    const noticeByStatus = {
      pending_review: { type: 'pending', text: '这条记录审核中，通过后访客可见。' },
      approved: { type: 'approved', text: '这条记录已通过审核。' },
      rejected: { type: 'rejected', text: '这条记录未通过审核，可修改后重新提交。' },
      hidden: { type: 'hidden', text: item.hiddenReason || '这条记录已被管理员隐藏。' },
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

  approveMemory() {
    this.reviewMemory('approve')
  },

  rejectMemory() {
    this.reviewMemory('reject')
  },

  hideMemory() {
    this.handleMemoryVisibility('hide')
  },

  restoreMemory() {
    this.handleMemoryVisibility('restore')
  },

  reviewMemory(action) {
    const title = action === 'approve' ? '通过记录' : '拒绝记录'
    const content = action === 'approve' ? '通过后访客可以查看这条记录。' : '拒绝后这条记录不会公开展示。'
    this.confirmAdminAction(title, content, async () => {
      const { result } = await wx.cloud.callFunction({
        name: 'reviewContent',
        data: {
          targetType: 'memory',
          targetId: this.data.memoryId,
          action,
          reason: action === 'reject' ? '内容未通过人工审核' : '',
        },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '处理失败')
      }
    })
  },

  handleMemoryVisibility(action) {
    const title = action === 'restore' ? '恢复记录' : '隐藏记录'
    const content = action === 'restore' ? '恢复后这条记录会重新通过审核。' : '隐藏后这条记录不会继续公开展示。'
    this.confirmAdminAction(title, content, async () => {
      const { result } = await wx.cloud.callFunction({
        name: 'hidePublicContent',
        data: {
          targetType: 'memory',
          targetId: this.data.memoryId,
          action,
          reason: '管理员在详情页处理',
        },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '处理失败')
      }
    })
  },

  confirmAdminAction(title, content, onConfirm) {
    if (!this.data.isAdminReviewer || !this.data.memoryId) {
      return
    }

    wx.showModal({
      title,
      content,
      confirmColor: '#8b5cf6',
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        try {
          await onConfirm()
          wx.showToast({ title: '已处理', icon: 'success' })
          this.loadMemory()
        } catch (error) {
          wx.showToast({ title: error.message || '处理失败', icon: 'none' })
        }
      },
    })
  },

  getDirtyVersion() {
    return Number(wx.getStorageSync('memoryListDirty') || 0)
  },
})
