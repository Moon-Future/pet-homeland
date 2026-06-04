const auth = require('../../utils/auth')

const defaultPetImage = '/assets/home/default-pet.png'

Page({
  data: {
    isLoggedIn: false,
    loadingPet: false,
    hasPet: false,
    pet: null,
    actions: [
      { label: '想你了', icon: '/assets/icons/heart.svg' },
      { label: '送花', icon: '/assets/icons/flower.svg' },
      { label: '点亮星光', icon: '/assets/icons/star.svg' },
    ],
    stats: [],
  },

  onLoad() {
    this.refreshPetDetail()
  },

  onShow() {
    this.refreshPetDetail()
  },

  refreshPetDetail() {
    const isLoggedIn = auth.isLoggedIn()
    this.setData({ isLoggedIn })

    if (!isLoggedIn) {
      this.setData({
        loadingPet: false,
        hasPet: false,
        pet: null,
        stats: [],
      })
      return
    }

    this.loadPetDetail()
  },

  async loadPetDetail() {
    if (!wx.cloud) {
      wx.showToast({ title: '请先开通云开发', icon: 'none' })
      return
    }

    this.setData({ loadingPet: true })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getMyPetSpaces',
        data: {},
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '读取宠物小窝失败')
      }

      const rawList = result.petSpaces || []
      const selectedId = wx.getStorageSync('selectedPetSpaceId')
      const rawPet = rawList.find((item) => item._id === selectedId) || rawList[0]

      if (!rawPet) {
        this.setData({
          loadingPet: false,
          hasPet: false,
          pet: null,
          stats: [],
        })
        return
      }

      const pet = this.normalizePet(rawPet)
      this.setData({
        loadingPet: false,
        hasPet: true,
        pet,
        stats: this.normalizeStats(rawPet.stats),
      })
    } catch (error) {
      this.setData({ loadingPet: false, hasPet: false, pet: null, stats: [] })
      wx.showToast({
        title: error.message || '读取宠物小窝失败',
        icon: 'none',
      })
    }
  },

  normalizePet(item = {}) {
    const lifeStatus = item.lifeStatus || 'with_me'
    const isInStars = lifeStatus === 'in_stars'
    const dateText = this.getDateText(item)
    const days = this.getRelationDays(item)

    return {
      id: item._id,
      name: item.petName || '未命名小窝',
      status: isInStars ? '已去星星' : '陪伴中',
      dateText,
      days,
      dayText: isInStars ? `离开 ${days} 天` : `陪伴第 ${days} 天`,
      avatar: item.avatarFileId || item.coverFileId || defaultPetImage,
      cover: item.coverFileId || item.avatarFileId || defaultPetImage,
      story: item.story || '还没有故事，去写下第一段回忆吧。',
    }
  },

  normalizeStats(stats = {}) {
    return [
      { label: '想念', value: stats.missCount || 0 },
      { label: '回忆', value: stats.memoryCount || 0 },
      { label: '星光', value: stats.starCount || 0 },
      { label: '相册', value: stats.mediaCount || 0 },
    ]
  },

  getDateText(item = {}) {
    const start = item.birthDate || '日期待补充'
    const end = item.lifeStatus === 'in_stars'
      ? (item.deathDate || '日期待补充')
      : '现在'

    return `${start} - ${end}`
  },

  getRelationDays(item = {}) {
    const baseDate = item.lifeStatus === 'in_stars' ? item.deathDate : item.birthDate
    if (!baseDate) {
      return 0
    }

    const date = new Date(baseDate)
    if (Number.isNaN(date.getTime())) {
      return 0
    }

    const diff = Date.now() - date.getTime()
    return Math.max(0, Math.floor(diff / 86400000))
  },

  goLogin() {
    wx.switchTab({
      url: '/pages/profile/index',
    })
  },

  goCreate() {
    wx.navigateTo({
      url: '/pages/pet-create/index',
    })
  },

  goTimeline() {
    if (!auth.requireLogin()) {
      return
    }

    wx.navigateTo({ url: '/pages/timeline/index' })
  },

  goAlbum() {
    if (!auth.requireLogin()) {
      return
    }

    wx.navigateTo({ url: '/pages/album/index' })
  },

  goLetter() {
    if (!auth.requireLogin()) {
      return
    }

    wx.navigateTo({ url: '/pages/ai-letter/index' })
  },

  goBook() {
    if (!auth.requireLogin()) {
      return
    }

    wx.navigateTo({ url: '/pages/ai-book/index' })
  },

  goStarSpace() {
    wx.switchTab({ url: '/pages/star-space/index' })
  },
})
