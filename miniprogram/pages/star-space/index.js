const auth = require('../../utils/auth')

const defaultPetImage = '/assets/home/default-pet.png'
const filters = [
  { id: 'all', label: '全部星星' },
  { id: 'recent', label: '最近更新' },
  { id: 'with_me', label: '正在星宠乡' },
  { id: 'in_stars', label: '住在星星上' },
  { id: 'cat', label: '猫咪' },
  { id: 'dog', label: '狗狗' },
  { id: 'other', label: '其他' },
]

Page({
  data: {
    filters,
    activeFilter: 'all',
    loading: false,
    pets: [],
    selectedPet: null,
    skeletonStars: [
      { id: 1, x: 12, y: 22, size: 'large' },
      { id: 2, x: 42, y: 18, size: 'small' },
      { id: 3, x: 72, y: 36, size: 'medium' },
      { id: 4, x: 24, y: 58, size: 'medium' },
      { id: 5, x: 58, y: 68, size: 'large' },
    ],
    summary: {
      total: 0,
      withMe: 0,
      inStars: 0,
    },
  },

  onLoad() {
    if (!auth.requireLogin({ redirectToProfile: true })) {
      return
    }

    this.loadDiscoverPets()
  },

  onShow() {
    wx.removeStorageSync('viewPetSpaceId')
    wx.removeStorageSync('viewSource')
  },

  selectFilter(e) {
    const filter = e.currentTarget.dataset.filter
    if (!filter || filter === this.data.activeFilter) {
      return
    }

    this.setData({ activeFilter: filter })
    this.loadDiscoverPets()
  },

  refreshSky() {
    this.setData({ selectedPet: null })
    this.loadDiscoverPets()
  },

  async loadDiscoverPets() {
    if (this.data.loading) {
      return
    }

    this.setData({ loading: true })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getDiscoverPetSpaces',
        data: {
          filter: this.data.activeFilter,
          limit: 20,
        },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '读取星空失败')
      }

      const pets = (result.petSpaces || []).map((item, index) => this.normalizePet(item, index))

      this.setData({
        loading: false,
        pets,
        selectedPet: null,
        summary: this.buildSummary(pets),
      })
    } catch (error) {
      this.setData({ loading: false, pets: [], selectedPet: null, summary: this.buildSummary([]) })
      wx.showToast({
        title: error.message || '读取星空失败',
        icon: 'none',
      })
    }
  },

  normalizePet(item = {}, index) {
    const isInStars = item.lifeStatus === 'in_stars'
    const days = this.getDaysSince(isInStars ? item.deathDate : item.arrivalDate)
    const position = this.getPosition(index)

    return {
      id: item._id,
      name: item.petName || '未命名小窝',
      avatar: item.avatarTempUrl || item.coverTempUrl || item.avatarUrl || item.coverUrl || defaultPetImage,
      lifeStatus: item.lifeStatus || 'with_me',
      isInStars,
      isOwner: Boolean(item.isOwner),
      petType: item.petType || 'other',
      statusText: isInStars ? '住在星星上' : '正在星宠乡',
      metaText: isInStars ? `离开 ${days} 天` : `陪伴 ${days} 天`,
      story: item.story || (isInStars ? '回忆还在发光' : '今天也在发光'),
      x: position.x,
      y: position.y,
      size: position.size,
    }
  },

  getPosition(index) {
    const positions = [
      { x: 10, y: 18, size: 'large' },
      { x: 38, y: 10, size: 'small' },
      { x: 68, y: 20, size: 'medium' },
      { x: 22, y: 42, size: 'medium' },
      { x: 54, y: 45, size: 'large' },
      { x: 80, y: 48, size: 'small' },
      { x: 12, y: 70, size: 'small' },
      { x: 42, y: 74, size: 'medium' },
      { x: 72, y: 76, size: 'large' },
      { x: 6, y: 34, size: 'small' },
      { x: 30, y: 26, size: 'large' },
      { x: 58, y: 12, size: 'small' },
      { x: 84, y: 30, size: 'medium' },
      { x: 18, y: 56, size: 'large' },
      { x: 48, y: 60, size: 'small' },
      { x: 76, y: 62, size: 'medium' },
      { x: 26, y: 82, size: 'small' },
      { x: 62, y: 86, size: 'medium' },
      { x: 88, y: 82, size: 'small' },
      { x: 46, y: 32, size: 'medium' },
    ]

    return positions[index % positions.length]
  },

  buildSummary(pets) {
    return {
      total: pets.length,
      withMe: pets.filter((item) => !item.isInStars).length,
      inStars: pets.filter((item) => item.isInStars).length,
    }
  },

  getDaysSince(dateText) {
    if (!dateText) {
      return 0
    }

    const date = new Date(dateText)
    if (Number.isNaN(date.getTime())) {
      return 0
    }

    return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
  },

  selectPet(e) {
    const petSpaceId = e.currentTarget.dataset.id
    if (!petSpaceId) {
      return
    }

    const pet = this.data.pets.find((item) => item.id === petSpaceId)
    if (!pet) {
      return
    }

    if (!this.data.selectedPet || this.data.selectedPet.id !== petSpaceId) {
      this.setData({ selectedPet: pet })
      return
    }

    this.enterPetSpace(pet)
  },

  enterSelectedPet() {
    if (!this.data.selectedPet) {
      return
    }

    this.enterPetSpace(this.data.selectedPet)
  },

  enterPetSpace(pet) {
    const petSpaceId = pet.id

    if (pet.isOwner) {
      wx.setStorageSync('selectedPetSpaceId', petSpaceId)
      wx.removeStorageSync('viewPetSpaceId')
      wx.removeStorageSync('viewSource')
    } else {
      wx.setStorageSync('viewPetSpaceId', petSpaceId)
      wx.setStorageSync('viewSource', 'star_square')
    }

    wx.switchTab({
      url: '/pages/pet-detail/index',
    })
  },

  goMyPetSpace() {
    wx.removeStorageSync('viewPetSpaceId')
    wx.removeStorageSync('viewSource')
    wx.switchTab({
      url: '/pages/pet-detail/index',
    })
  },
})
