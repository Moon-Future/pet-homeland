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
      { id: 'cloud', name: '梦幻花谷', image: 'https://qiniu.cdn.cl8023.com/project/star-paws/themes/cloud-garden.png' },
      { id: 'rainbow', name: '日落花海', image: 'https://qiniu.cdn.cl8023.com/project/star-paws/themes/sunset-flowers.png' },
      { id: 'starry', name: '星空晨曦', image: 'https://qiniu.cdn.cl8023.com/project/star-paws/themes/starry-sky.png' },
      { id: 'sakura', name: '樱花大道', image: 'https://qiniu.cdn.cl8023.com/project/star-paws/themes/sakura-avenue.png' },
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

      const savedId = wx.getStorageSync('selectedPetSpaceId')
      const rawList = result.petSpaces || []
      const selectedRaw = rawList.find((item) => item._id === savedId) || rawList[0]
      const selectedId = selectedRaw && selectedRaw._id
      const petSpaces = rawList.map((item) => this.normalizePetSpace(item, item._id === selectedId))
      const featuredPet = selectedRaw ? this.normalizeFeaturedPet(this.normalizePetSpace(selectedRaw, true)) : null

      if (selectedId) {
        wx.setStorageSync('selectedPetSpaceId', selectedId)
      }

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

  normalizePetSpace(item = {}, active = false) {
    const lifeStatus = item.lifeStatus || 'with_me'
    const isInStars = lifeStatus === 'in_stars'
    const ageText = this.getAgeText(item.birthDate)
    const companionDays = this.getDaysSince(item.arrivalDate)
    const awayDays = this.getDaysSince(item.deathDate)
    const metrics = []

    if (ageText) {
      metrics.push(`${ageText}`)
    }

    if (companionDays !== null) {
      metrics.push(`陪伴 ${companionDays} 天`)
    }

    if (isInStars && awayDays !== null) {
      metrics.push(`离开 ${awayDays} 天`)
    }

    return {
      id: item._id,
      raw: item,
      petName: item.petName || '未命名小窝',
      active,
      statusText: isInStars ? '已去星星' : '陪伴中',
      statusClass: isInStars ? 'status-in-stars' : 'status-with-me',
      metrics,
      avatar: item.avatarFileId || item.coverFileId || item.avatarUrl || item.coverUrl || defaultPetImage,
      cover: item.coverFileId || item.avatarFileId || item.coverUrl || item.avatarUrl || defaultPetImage,
      story: item.story || '',
    }
  },

  normalizeFeaturedPet(pet) {
    return {
      ...pet,
      recentTitle: pet.raw.lifeStatus === 'in_stars' ? '最近思念' : '最近陪伴',
      metricText: pet.metrics.length ? pet.metrics.join(' · ') : '日期待补充',
      message: pet.story || '还没有记录，去写下第一段回忆吧',
    }
  },

  getDaysSince(dateText) {
    if (!dateText) {
      return null
    }
    const baseDate = dateText
    const date = new Date(baseDate)
    if (Number.isNaN(date.getTime())) {
      return null
    }

    const diff = Date.now() - date.getTime()
    return Math.max(0, Math.floor(diff / 86400000))
  },

  getAgeText(birthDate) {
    if (!birthDate) {
      return ''
    }

    const birth = new Date(birthDate)
    const now = new Date()

    if (Number.isNaN(birth.getTime()) || birth > now) {
      return ''
    }

    let years = now.getFullYear() - birth.getFullYear()
    let months = now.getMonth() - birth.getMonth()

    if (now.getDate() < birth.getDate()) {
      months -= 1
    }

    if (months < 0) {
      years -= 1
      months += 12
    }

    const totalMonths = Math.max(0, years * 12 + months)

    if (years > 0) {
      return months > 0 ? `${years}岁${months}个月` : `${years}岁`
    }

    return `${totalMonths || 1}个月`
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
    wx.navigateTo({
      url: '/pages/pet-list/index',
    })
  },

  onSelectPet(e) {
    if (!auth.requireLogin()) {
      return
    }

    const { id } = e.currentTarget.dataset
    if (!id) {
      return
    }

    wx.setStorageSync('selectedPetSpaceId', id)

    const petSpaces = this.data.petSpaces.map((item) => ({
      ...item,
      active: item.id === id,
    }))
    const selectedPet = petSpaces.find((item) => item.id === id)

    this.setData({
      petSpaces,
      featuredPet: selectedPet ? this.normalizeFeaturedPet(selectedPet) : this.data.featuredPet,
    })
  },

  enterCurrentPet() {
    const currentPet = this.data.petSpaces.find((item) => item.active) || this.data.petSpaces[0]

    if (currentPet && currentPet.id) {
      wx.setStorageSync('selectedPetSpaceId', currentPet.id)
    }

    wx.removeStorageSync('viewPetSpaceId')
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
