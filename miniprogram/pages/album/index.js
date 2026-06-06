const auth = require('../../utils/auth')

const filters = [
  { id: 'all', label: '全部' },
  { id: 'daily', label: '日常' },
  { id: 'travel', label: '旅行' },
  { id: 'growth', label: '成长' },
  { id: 'birthday', label: '生日' },
  { id: 'health', label: '健康' },
]

Page({
  data: {
    filters,
    activeFilter: 'all',
    petSpaceId: '',
    loading: false,
    photos: [],
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
    this.loadPhotos()
  },

  onShow() {
    const dirtyVersion = this.getDirtyVersion()
    if (this.data.petSpaceId && dirtyVersion !== this.data.dirtyVersion) {
      this.setData({ dirtyVersion })
      this.loadPhotos()
    }
  },

  selectFilter(e) {
    const filter = e.currentTarget.dataset.filter
    if (!filter || filter === this.data.activeFilter) {
      return
    }

    this.setData({ activeFilter: filter })
    this.loadPhotos()
  },

  async loadPhotos() {
    if (!this.data.petSpaceId || this.data.loading) {
      return
    }

    this.setData({ loading: true })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getMemories',
        data: {
          petSpaceId: this.data.petSpaceId,
          type: this.data.activeFilter,
          limit: 100,
        },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '读取相册失败')
      }

      const photos = []
      ;(result.memories || []).forEach((memory) => {
        ;(memory.mediaUrls || []).forEach((url, index) => {
          photos.push({
            id: `${memory._id}-${index}`,
            url,
            title: memory.title || '回忆照片',
          })
        })
      })

      this.setData({
        loading: false,
        photos,
        dirtyVersion: this.getDirtyVersion(),
      })
    } catch (error) {
      this.setData({ loading: false, photos: [] })
      wx.showToast({
        title: error.message || '读取相册失败',
        icon: 'none',
      })
    }
  },

  addMemory() {
    if (!this.data.petSpaceId) {
      return
    }

    wx.navigateTo({
      url: `/pages/memory-create/index?petSpaceId=${this.data.petSpaceId}`,
    })
  },

  previewPhoto(e) {
    const url = e.currentTarget.dataset.url
    if (!url) {
      return
    }

    wx.previewImage({
      current: url,
      urls: this.data.photos.map((item) => item.url),
    })
  },

  getDirtyVersion() {
    return Number(wx.getStorageSync('memoryListDirty') || 0)
  },
})
