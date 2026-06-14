const storage = require('../../utils/storage')
const auth = require('../../utils/auth')

const defaultPetImage = storage.defaultPetImage
const homeCacheKey = 'homePetSpacesCache:v1'

Page({
  data: {
    isLoggedIn: false,
    loadingPets: false,
    hasPetSpaces: false,
    homeBg: storage.assetUrl('images/home-bg.png'),
    defaultPetImage,
    featuredPet: null,
    petSpaces: [],
    groupedPetSpaces: [],
    themePreviews: [
      { id: 'cloud', name: '梦幻花谷', image: storage.themeImages.cloud },
      { id: 'rainbow', name: '日落花海', image: storage.themeImages.rainbow },
      { id: 'starry', name: '星空晨曦', image: storage.themeImages.starry },
      { id: 'sakura', name: '樱花大道', image: storage.themeImages.sakura },
    ],
  },

  onLoad() {
    this._skipNextShow = true
    this.refreshHome({ useCache: true })
  },

  onShow() {
    if (this._skipNextShow) {
      this._skipNextShow = false
      return
    }

    this.refreshHome({ useCache: true, silent: this.data.hasPetSpaces })
  },

  refreshHome(options = {}) {
    const isLoggedIn = auth.isLoggedIn()
    this.setData({ isLoggedIn })

    if (!isLoggedIn) {
      this.setData({
        loadingPets: false,
        hasPetSpaces: false,
        featuredPet: null,
        petSpaces: [],
        groupedPetSpaces: [],
      })
      return
    }

    if (options.useCache) {
      this.applyHomeCache()
    }

    this.loadPetSpaces({ silent: options.silent || this.data.hasPetSpaces })
  },

  async loadPetSpaces(options = {}) {
    if (!wx.cloud) {
      wx.showToast({ title: '请先开通云开发', icon: 'none' })
      return
    }

    if (!options.silent) {
      this.setData({ loadingPets: true })
    }

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
        groupedPetSpaces: this.groupPetSpaces(petSpaces),
        featuredPet,
      })

      wx.setStorageSync(homeCacheKey, {
        selectedId: selectedId || '',
        petSpaces: rawList,
        cachedAt: Date.now(),
      })
    } catch (error) {
      this.setData({
        loadingPets: false,
        hasPetSpaces: this.data.hasPetSpaces,
        petSpaces: this.data.petSpaces,
        groupedPetSpaces: this.data.groupedPetSpaces,
        featuredPet: this.data.featuredPet,
      })
      wx.showToast({
        title: error.message || '读取宠物小窝失败',
        icon: 'none',
      })
    }
  },

  applyHomeCache() {
    const cache = wx.getStorageSync(homeCacheKey)
    const rawList = cache && Array.isArray(cache.petSpaces) ? cache.petSpaces : []

    if (!rawList.length || this.data.hasPetSpaces) {
      return
    }

    const savedId = wx.getStorageSync('selectedPetSpaceId') || cache.selectedId
    const selectedRaw = rawList.find((item) => item._id === savedId) || rawList[0]
    const selectedId = selectedRaw && selectedRaw._id
    const petSpaces = rawList.map((item) => this.normalizePetSpace(item, item._id === selectedId))
    const featuredPet = selectedRaw ? this.normalizeFeaturedPet(this.normalizePetSpace(selectedRaw, true)) : null

    this.setData({
      loadingPets: false,
      hasPetSpaces: petSpaces.length > 0,
      petSpaces,
      groupedPetSpaces: this.groupPetSpaces(petSpaces),
      featuredPet,
    })
  },

  normalizePetSpace(item = {}, active = false) {
    const lifeStatus = item.lifeStatus || 'with_me'
    const isInStars = lifeStatus === 'in_stars'
    const ageText = this.getAgeText(item.birthDate)
    const companionDays = this.getDaysSince(item.arrivalDate)
    const awayDays = this.getDaysSince(item.deathDate)
    const metrics = []
    const gender = item.gender || 'unknown'
    const genderSymbolByType = {
      female: '♀',
      male: '♂',
      unknown: '',
    }

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
      gender,
      genderSymbol: genderSymbolByType[gender] || '',
      genderClass: gender,
      statusText: isInStars ? '已去星星' : '陪伴中',
      statusClass: isInStars ? 'status-in-stars' : 'status-with-me',
      spaceTypeText: isInStars ? '纪念空间' : '宠物小窝',
      groupKey: isInStars ? 'memorial' : 'companion',
      metrics,
      avatar: item.avatarUrl || item.coverUrl || defaultPetImage,
      cover: item.coverUrl || item.avatarUrl || defaultPetImage,
      story: item.story || '',
    }
  },

  normalizeFeaturedPet(pet) {
    const isMemorial = pet.raw.lifeStatus === 'in_stars'
    return {
      ...pet,
      recentTitle: isMemorial ? '最近思念' : '最近陪伴',
      metricText: pet.metrics.length ? pet.metrics.join(' · ') : '日期待补充',
      message: pet.story || (isMemorial ? '还没有回忆，去写下第一段想念吧' : '还没有记录，去写下第一段回忆吧'),
    }
  },

  groupPetSpaces(petSpaces = []) {
    const companion = petSpaces.filter((item) => item.groupKey !== 'memorial')
    const memorial = petSpaces.filter((item) => item.groupKey === 'memorial')
    const groups = []

    if (companion.length) {
      groups.push({ key: 'companion', title: '陪伴中', items: companion })
    }

    if (memorial.length) {
      groups.push({ key: 'memorial', title: '纪念中', items: memorial })
    }

    return groups
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
      groupedPetSpaces: this.groupPetSpaces(petSpaces),
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

  previewPetAvatar(e) {
    const url = e.currentTarget.dataset.url
    if (!url) {
      return
    }

    wx.previewImage({
      current: url,
      urls: [url],
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
