const auth = require('../../utils/auth')

const defaultPetImage = '/assets/home/default-pet.png'
const themeBackgrounds = {
  cloud: 'https://qiniu.cdn.cl8023.com/project/star-paws/themes/cloud-garden.png',
  rainbow: 'https://qiniu.cdn.cl8023.com/project/star-paws/themes/sunset-flowers.png',
  starry: 'https://qiniu.cdn.cl8023.com/project/star-paws/themes/starry-sky.png',
  sakura: 'https://qiniu.cdn.cl8023.com/project/star-paws/themes/sakura-avenue.png',
}

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
    const metrics = this.getPetMetrics(item)

    return {
      id: item._id,
      name: item.petName || '未命名小窝',
      status: isInStars ? '已去星星' : '陪伴中',
      dateText,
      metrics,
      dayText: metrics.length ? metrics.join(' · ') : '日期待补充',
      avatar: item.avatarFileId || item.coverFileId || defaultPetImage,
      cover: themeBackgrounds[item.theme] || item.coverFileId || item.avatarFileId || defaultPetImage,
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
    const dates = []

    if (item.birthDate) {
      dates.push(`出生 ${item.birthDate}`)
    }

    if (item.arrivalDate) {
      dates.push(`来到身边 ${item.arrivalDate}`)
    }

    if (item.lifeStatus === 'in_stars' && item.deathDate) {
      dates.push(`离去 ${item.deathDate}`)
    }

    return dates.length ? dates.join(' · ') : '日期待补充'
  },

  getPetMetrics(item = {}) {
    const isInStars = item.lifeStatus === 'in_stars'
    const ageText = this.getAgeText(item.birthDate)
    const companionDays = this.getDaysSince(item.arrivalDate)
    const awayDays = this.getDaysSince(item.deathDate)
    const metrics = []

    if (ageText) {
      metrics.push(`年龄 ${ageText}`)
    }

    if (companionDays !== null) {
      metrics.push(`陪伴 ${companionDays} 天`)
    }

    if (isInStars && awayDays !== null) {
      metrics.push(`离开 ${awayDays} 天`)
    }

    return metrics
  },

  getDaysSince(dateText) {
    if (!dateText) {
      return null
    }

    const date = new Date(dateText)
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

  goStarSpace() {
    wx.switchTab({ url: '/pages/star-space/index' })
  },
})
