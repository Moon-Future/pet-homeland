const auth = require('../../utils/auth')

const tabs = [
  { id: 'petSpaces', label: '小窝' },
  { id: 'memories', label: '回忆' },
  { id: 'reports', label: '举报' },
]

Page({
  data: {
    tabs,
    activeTab: 'petSpaces',
    loading: false,
    petSpaces: [],
    memories: [],
    reports: [],
  },

  onLoad() {
    if (!auth.requireLogin({ redirectToProfile: true })) {
      return
    }

    this.loadItems()
  },

  selectTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (!tab || tab === this.data.activeTab) {
      return
    }

    this.setData({ activeTab: tab })
  },

  async loadItems() {
    if (this.data.loading) {
      return
    }

    this.setData({ loading: true })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getAdminReviewItems',
        data: { limit: 30 },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '读取审核列表失败')
      }

      this.setData({
        loading: false,
        petSpaces: (result.petSpaces || []).map(this.normalizePetSpace),
        memories: (result.memories || []).map(this.normalizeMemory),
        reports: result.reports || [],
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '读取审核列表失败', icon: 'none' })
    }
  },

  normalizePetSpace(item = {}) {
    return {
      ...item,
      title: item.petName || '未命名小窝',
      desc: item.story || '没有填写公开简介',
      cover: item.coverFileId || item.avatarFileId || item.coverUrl || item.avatarUrl || '/assets/home/default-pet.png',
      meta: `${item.lifeStatus === 'in_stars' ? '已去星星' : '陪伴中'} · 举报 ${item.reportCount || 0}`,
    }
  },

  normalizeMemory(item = {}) {
    return {
      ...item,
      title: item.title || '今天的记录',
      desc: item.content || (item.mediaFileIds && item.mediaFileIds.length ? '包含图片记录' : '没有正文'),
      meta: item.memoryDate || '日期待补充',
    }
  },

  openPetSpace(e) {
    const id = e.currentTarget.dataset.id
    if (!id) {
      return
    }

    wx.setStorageSync('viewPetSpaceId', id)
    wx.setStorageSync('viewSource', 'admin_review')
    wx.switchTab({ url: '/pages/pet-detail/index' })
  },

  openMemory(e) {
    const { id, petSpaceId } = e.currentTarget.dataset
    if (!id) {
      return
    }

    wx.navigateTo({
      url: `/pages/memory-detail/index?petSpaceId=${petSpaceId || ''}&memoryId=${id}&source=admin_review`,
    })
  },

  openReportTarget(e) {
    const { type, targetId } = e.currentTarget.dataset
    if (!targetId) {
      return
    }

    if (type === 'memory') {
      wx.navigateTo({
        url: `/pages/memory-detail/index?memoryId=${targetId}&source=admin_review`,
      })
      return
    }

    wx.setStorageSync('viewPetSpaceId', targetId)
    wx.setStorageSync('viewSource', 'admin_review')
    wx.switchTab({ url: '/pages/pet-detail/index' })
  },

  approve(e) {
    this.review(e.currentTarget.dataset, 'approve')
  },

  reject(e) {
    this.review(e.currentTarget.dataset, 'reject')
  },

  hide(e) {
    const { id, type } = e.currentTarget.dataset
    this.confirmAction('隐藏内容', '隐藏后内容不会继续公开展示。', async () => {
      await this.callFunction('hidePublicContent', {
        targetType: type,
        targetId: id,
        action: 'hide',
        reason: '管理员人工隐藏',
      })
    })
  },

  restore(e) {
    const { id, type } = e.currentTarget.dataset
    this.confirmAction('恢复内容', '恢复后内容会重新通过审核并允许公开展示。', async () => {
      await this.callFunction('hidePublicContent', {
        targetType: type,
        targetId: id,
        action: 'restore',
      })
    })
  },

  resolveReport(e) {
    const { id } = e.currentTarget.dataset
    this.confirmAction('处理举报', '确认这条举报已经处理完成？', async () => {
      await this.callFunction('resolveReport', {
        reportId: id,
        resolution: '管理员已处理',
      })
    })
  },

  review(dataset, action) {
    const { id, type } = dataset
    const title = action === 'approve' ? '通过审核' : '拒绝内容'
    const content = action === 'approve' ? '通过后内容可以公开展示。' : '拒绝后内容不会公开展示。'

    this.confirmAction(title, content, async () => {
      await this.callFunction('reviewContent', {
        targetType: type,
        targetId: id,
        action,
        reason: action === 'reject' ? '内容未通过人工审核' : '',
      })
    })
  },

  confirmAction(title, content, onConfirm) {
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
          this.loadItems()
        } catch (error) {
          wx.showToast({ title: error.message || '处理失败', icon: 'none' })
        }
      },
    })
  },

  async callFunction(name, data) {
    const { result } = await wx.cloud.callFunction({ name, data })
    if (!result || !result.ok) {
      throw new Error((result && result.message) || '处理失败')
    }
  },
})
