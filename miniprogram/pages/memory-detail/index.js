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
    dirtyVersion: 0,
  },

  onLoad(options = {}) {
    if (!auth.requireLogin({ redirectToProfile: true })) {
      return
    }

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
    }
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
    if (!this.data.memoryId) {
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
