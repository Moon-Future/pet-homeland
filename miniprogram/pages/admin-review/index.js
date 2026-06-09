const auth = require('../../utils/auth')
const storage = require('../../utils/storage')

const tabs = [
  { id: 'petSpaces', label: '小窝' },
  { id: 'memories', label: '回忆' },
  { id: 'reports', label: '举报' },
  { id: 'hidden', label: '已隐藏' },
]

Page({
  data: {
    tabs,
    activeTab: 'petSpaces',
    loading: false,
    loadedOnce: false,
    petSpaces: [],
    memories: [],
    reports: [],
    hiddenItems: [],
  },

  onLoad() {
    if (!auth.requireLogin({ redirectToProfile: true })) {
      return
    }

    this.loadItems()
  },

  onShow() {
    if (this.data.loadedOnce) {
      this.loadItems()
    }
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
        loadedOnce: true,
        petSpaces: (result.petSpaces || []).map(this.normalizePetSpace),
        memories: (result.memories || []).map(this.normalizeMemory),
        reports: result.reports || [],
        hiddenItems: (result.hiddenItems || []).map(this.normalizeHiddenItem),
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
      cover: item.coverUrl || item.avatarUrl || storage.defaultPetImage,
      meta: `${item.lifeStatus === 'in_stars' ? '已去星星' : '陪伴中'} · 举报 ${item.reportCount || 0}`,
    }
  },

  normalizeMemory(item = {}) {
    return {
      ...item,
      title: item.title || '今天的记录',
      desc: item.content || (item.mediaRefs && item.mediaRefs.length ? '包含图片记录' : '没有正文'),
      meta: item.memoryDate || '日期待补充',
    }
  },

  normalizeHiddenItem(item = {}) {
    if (item.targetType === 'memory') {
      return {
        ...item,
        title: item.title || '今天的记录',
        desc: item.content || '这条回忆已被隐藏',
        meta: `回忆 · ${item.memoryDate || '日期待补充'}`,
      }
    }

    return {
      ...item,
      title: item.petName || '未命名小窝',
      desc: item.story || '这个小窝已被隐藏',
      cover: item.coverUrl || item.avatarUrl || storage.defaultPetImage,
      meta: `${item.lifeStatus === 'in_stars' ? '已去星星' : '陪伴中'} · 小窝`,
    }
  },

  openPetSpace(e) {
    const { id, index } = e.currentTarget.dataset
    if (!id) {
      return
    }

    this.openReviewDetail('pet_space', id, Number(index) || 0, this.data.petSpaces)
  },

  openMemory(e) {
    const { id, index } = e.currentTarget.dataset
    if (!id) {
      return
    }

    this.openReviewDetail('memory', id, Number(index) || 0, this.data.memories)
  },

  openReportTarget(e) {
    const { id, index } = e.currentTarget.dataset
    if (!id) {
      return
    }

    this.openReviewDetail('report', id, Number(index) || 0, this.data.reports)
  },

  openHiddenItem(e) {
    const { id, index } = e.currentTarget.dataset
    if (!id) {
      return
    }

    this.openReviewDetail('hidden', id, Number(index) || 0, this.data.hiddenItems)
  },

  openReviewDetail(type, id, index, queue) {
    wx.setStorageSync('adminReviewQueue', {
      type,
      index,
      items: queue || [],
    })
    wx.navigateTo({
      url: `/pages/admin-review-detail/index?type=${type}&id=${id}&index=${index}`,
    })
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
    this.confirmAction('恢复内容', '恢复后会回到隐藏前的审核状态。', async () => {
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
