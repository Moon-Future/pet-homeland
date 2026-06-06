const auth = require('../../utils/auth')

const tabs = [
  { id: 'all', label: '全部' },
  { id: 'growth', label: '成长' },
  { id: 'travel', label: '旅行' },
  { id: 'daily', label: '日常' },
  { id: 'birthday', label: '生日' },
  { id: 'health', label: '健康' },
]

const typeLabels = tabs.reduce((map, item) => {
  map[item.id] = item.label
  return map
}, {})

Page({
  data: {
    tabs,
    activeTab: 'all',
    petSpaceId: '',
    loading: false,
    groups: [],
    dirtyVersion: 0,
  },

  onLoad(options = {}) {
    if (!auth.requireLogin({
      redirectToProfile: true,
    })) {
      return
    }

    this.setData({
      petSpaceId: options.petSpaceId || wx.getStorageSync('selectedPetSpaceId') || '',
      dirtyVersion: this.getDirtyVersion(),
    })
    this.loadMemories()
  },

  onShow() {
    const dirtyVersion = this.getDirtyVersion()
    if (this.data.petSpaceId && dirtyVersion !== this.data.dirtyVersion) {
      this.setData({ dirtyVersion })
      this.loadMemories()
    }
  },

  selectTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (!tab || tab === this.data.activeTab) {
      return
    }

    this.setData({ activeTab: tab })
    this.loadMemories()
  },

  async loadMemories() {
    if (!this.data.petSpaceId || this.data.loading) {
      return
    }

    this.setData({ loading: true })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getMemories',
        data: {
          petSpaceId: this.data.petSpaceId,
          type: this.data.activeTab,
          limit: 80,
        },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '读取时间轴失败')
      }

      this.setData({
        loading: false,
        dirtyVersion: this.getDirtyVersion(),
        groups: this.groupMemories(result.memories || []),
      })
    } catch (error) {
      this.setData({ loading: false, groups: [] })
      wx.showToast({
        title: error.message || '读取时间轴失败',
        icon: 'none',
      })
    }
  },

  groupMemories(memories) {
    const groups = []
    const groupMap = {}

    memories.forEach((memory) => {
      const item = this.normalizeMemory(memory)
      const key = item.memoryDate || 'unknown'

      if (!groupMap[key]) {
        groupMap[key] = {
          key,
          year: item.year,
          date: item.date,
          items: [],
        }
        groups.push(groupMap[key])
      }

      groupMap[key].items.push(item)
    })

    return groups
  },

  normalizeMemory(item = {}) {
    const date = item.memoryDate || ''
    const mediaUrls = item.mediaUrls || []

    return {
      id: item._id,
      memoryDate: date,
      year: date.slice(0, 4) || '未知',
      date: this.formatDate(date),
      title: item.title || typeLabels[item.type] || '今天的记录',
      desc: item.content || '这一天留下了这些照片。',
      type: item.type,
      typeLabel: typeLabels[item.type] || '日常',
      img: mediaUrls[0] || '',
      mediaUrls,
    }
  },

  formatDate(dateText) {
    const parts = dateText.split('-')
    if (parts.length !== 3) {
      return '日期待补充'
    }

    return `${Number(parts[1])}月${Number(parts[2])}日`
  },

  goMemoryDetail(e) {
    const memoryId = e.currentTarget.dataset.id
    if (!memoryId) {
      return
    }

    wx.navigateTo({
      url: `/pages/memory-detail/index?petSpaceId=${this.data.petSpaceId}&memoryId=${memoryId}`,
    })
  },

  getDirtyVersion() {
    return Number(wx.getStorageSync('memoryListDirty') || 0)
  },
})
