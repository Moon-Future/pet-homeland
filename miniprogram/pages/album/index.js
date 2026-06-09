const auth = require('../../utils/auth')
const storage = require('../../utils/storage')

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
    isOwner: false,
    defaultPetImage: storage.defaultPetImage,
  },

  onLoad(options = {}) {
    this.setData({
      petSpaceId: options.petSpaceId || wx.getStorageSync('selectedPetSpaceId') || '',
      dirtyVersion: this.getDirtyVersion(),
    })
    this.initializeAlbum()
  },

  onShow() {
    const dirtyVersion = this.getDirtyVersion()
    if (this.data.petSpaceId && dirtyVersion !== this.data.dirtyVersion) {
      this.setData({ dirtyVersion })
      this.initializeAlbum()
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

  async initializeAlbum() {
    await this.loadPetAccess()
    this.loadPhotos()
  },

  async loadPetAccess() {
    if (!this.data.petSpaceId) {
      this.setData({ isOwner: false })
      return
    }

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getPetSpaceDetail',
        data: {
          petSpaceId: this.data.petSpaceId,
          source: wx.getStorageSync('viewSource') || 'album',
        },
      })

      this.setData({
        isOwner: Boolean(result && result.ok && result.isOwner),
      })
    } catch (error) {
      this.setData({ isOwner: false })
    }
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
    if (!this.data.petSpaceId || !this.data.isOwner) {
      if (!auth.isLoggedIn()) {
        wx.showToast({ title: '请先到“我的”登录后再记录', icon: 'none' })
      }
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
