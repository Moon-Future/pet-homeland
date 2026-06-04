const auth = require('../../utils/auth')

const defaultPetImage = '/assets/home/default-pet.png'

Page({
  data: {
    isLoggedIn: false,
    loadingPets: false,
    hasPetSpaces: false,
    homeBg: 'https://qiniu.cdn.cl8023.com/project/star-paws/images/home-bg.png',
    featuredPet: null,
    petSpaces: [],
    themePreviews: [
      { id: 'rainbow', name: '彩虹桥', image: '/assets/themes/rainbow-bridge.svg' },
      { id: 'cloud', name: '云朵花园', image: '/assets/themes/cloud-garden.svg' },
      { id: 'starry', name: '星河夜空', image: '/assets/themes/starry-night.svg' },
    ],
  },

  onLoad() {
    this.refreshHome()
  },

  onShow() {
    this.refreshHome()
  },

  refreshHome() {
    const isLoggedIn = auth.isLoggedIn()
    this.setData({ isLoggedIn })

    if (!isLoggedIn) {
      this.setData({
        loadingPets: false,
        hasPetSpaces: false,
        featuredPet: null,
        petSpaces: [],
      })
      return
    }

    this.loadPetSpaces()
  },

  async loadPetSpaces() {
    if (!wx.cloud) {
      wx.showToast({ title: '请先开通云开发', icon: 'none' })
      return
    }

    this.setData({ loadingPets: true })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getMyPetSpaces',
        data: {},
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '读取宠物小窝失败')
      }

      const petSpaces = (result.petSpaces || []).map((item, index) => this.normalizePetSpace(item, index))
      const featuredPet = petSpaces[0] ? this.normalizeFeaturedPet(petSpaces[0]) : null

      this.setData({
        loadingPets: false,
        hasPetSpaces: petSpaces.length > 0,
        petSpaces,
        featuredPet,
      })
    } catch (error) {
      this.setData({ loadingPets: false, hasPetSpaces: false, petSpaces: [], featuredPet: null })
      wx.showToast({
        title: error.message || '读取宠物小窝失败',
        icon: 'none',
      })
    }
  },

  normalizePetSpace(item = {}, index = 0) {
    const lifeStatus = item.lifeStatus || 'with_me'
    const isInStars = lifeStatus === 'in_stars'
    const days = this.getRelationDays(item)

    return {
      id: item._id,
      raw: item,
      petName: item.petName || '未命名小窝',
      active: index === 0,
      statusText: isInStars ? '已去星星' : '陪伴中',
      statusClass: isInStars ? 'status-in-stars' : 'status-with-me',
      dayLabel: isInStars ? '离开' : '陪伴',
      days,
      avatar: item.avatarFileId || item.coverFileId || defaultPetImage,
      cover: item.coverFileId || item.avatarFileId || defaultPetImage,
      story: item.story || '',
    }
  },

  normalizeFeaturedPet(pet) {
    return {
      ...pet,
      recentTitle: pet.raw.lifeStatus === 'in_stars' ? '最近思念' : '最近陪伴',
      relationDays: pet.days,
      message: pet.story || '还没有记录，去写下第一段回忆吧',
    }
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

  onCreateMemorial() {
    if (!auth.requireLogin()) {
      return
    }

    wx.navigateTo({
      url: '/pages/pet-create/index',
    })
  },

  onViewAll() {
    wx.switchTab({
      url: '/pages/profile/index',
    })
  },

  onSelectPet(e) {
    if (!auth.requireLogin()) {
      return
    }

    const { id } = e.currentTarget.dataset
    if (id) {
      wx.setStorageSync('selectedPetSpaceId', id)
    }

    wx.switchTab({
      url: '/pages/pet-detail/index',
    })
  },

  onNavTap(e) {
    const { url } = e.currentTarget.dataset
    if (!url || url === '/pages/index/index') {
      return
    }
    wx.switchTab({ url })
  },

  goLogin() {
    wx.switchTab({
      url: '/pages/profile/index',
    })
  },
})
