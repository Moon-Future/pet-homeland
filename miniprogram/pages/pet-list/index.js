const auth = require('../../utils/auth')
const storage = require('../../utils/storage')

const defaultPetImage = storage.defaultPetImage

Page({
  data: {
    loading: false,
    hasPetSpaces: false,
    selectedId: '',
    petSpaces: [],
    groupedPetSpaces: [],
    defaultPetImage,
  },

  onLoad() {
    if (!auth.requireLogin()) {
      return
    }

    this.loadPetSpaces()
  },

  async loadPetSpaces() {
    if (!wx.cloud) {
      wx.showToast({ title: '请先开通云开发', icon: 'none' })
      return
    }

    this.setData({ loading: true })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getMyPetSpaces',
        data: {},
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '读取宠物列表失败')
      }

      const rawList = result.petSpaces || []
      const savedId = wx.getStorageSync('selectedPetSpaceId')
      const selectedRaw = rawList.find((item) => item._id === savedId) || rawList[0]
      const selectedId = selectedRaw && selectedRaw._id
      const petSpaces = rawList.map((item) => this.normalizePetSpace(item, item._id === selectedId))

      if (selectedId) {
        wx.setStorageSync('selectedPetSpaceId', selectedId)
      }

      this.setData({
        loading: false,
        hasPetSpaces: petSpaces.length > 0,
        selectedId: selectedId || '',
        petSpaces,
        groupedPetSpaces: this.groupPetSpaces(petSpaces),
      })
    } catch (error) {
      this.setData({ loading: false, hasPetSpaces: false, petSpaces: [], groupedPetSpaces: [] })
      wx.showToast({
        title: error.message || '读取宠物列表失败',
        icon: 'none',
      })
    }
  },

  normalizePetSpace(item = {}, active = false) {
    const lifeStatus = item.lifeStatus || 'with_me'
    const isInStars = lifeStatus === 'in_stars'
    const metrics = this.getPetMetrics(item)

    return {
      id: item._id,
      identityNo: item.identityNo || '',
      identityClaimed: Boolean(item.identityClaimed || item.identityClaimedAt),
      petName: item.petName || '未命名小窝',
      active,
      statusText: isInStars ? '已去星星' : '陪伴中',
      statusClass: isInStars ? 'status-in-stars' : 'status-with-me',
      groupKey: isInStars ? 'memorial' : 'companion',
      spaceTypeText: isInStars ? '纪念空间' : '宠物小窝',
      enterText: active ? (isInStars ? '进入当前纪念空间' : '进入当前小窝') : (isInStars ? '进入纪念空间' : '进入小窝'),
      metricText: metrics.length ? metrics.join(' · ') : '日期待补充',
      avatar: item.avatarUrl || item.coverUrl || defaultPetImage,
      story: item.story || (isInStars ? '还没有回忆，去写下第一段想念吧' : '还没有记录，去写下第一段回忆吧'),
    }
  },

  groupPetSpaces(petSpaces = []) {
    const companion = petSpaces.filter((item) => item.groupKey !== 'memorial')
    const memorial = petSpaces.filter((item) => item.groupKey === 'memorial')
    const groups = []

    if (companion.length) {
      groups.push({ key: 'companion', title: '陪伴中', desc: '还在身边的日常小窝', items: companion })
    }

    if (memorial.length) {
      groups.push({ key: 'memorial', title: '纪念中', desc: '已去星星的纪念空间', items: memorial })
    }

    return groups
  },

  getPetMetrics(item = {}) {
    const isInStars = item.lifeStatus === 'in_stars'
    const ageText = this.getAgeText(item.birthDate)
    const companionDays = this.getDaysSince(item.arrivalDate)
    const awayDays = this.getDaysSince(item.deathDate)
    const metrics = []

    if (ageText) {
      metrics.push(ageText)
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

  selectPet(e) {
    const id = e.currentTarget.dataset.id
    if (!id) {
      return
    }

    wx.setStorageSync('selectedPetSpaceId', id)
    const petSpaces = this.data.petSpaces.map((item) => {
      const active = item.id === id
      return {
        ...item,
        active,
        enterText: active
          ? (item.groupKey === 'memorial' ? '进入当前纪念空间' : '进入当前小窝')
          : (item.groupKey === 'memorial' ? '进入纪念空间' : '进入小窝'),
      }
    })

    this.setData({
      selectedId: id,
      petSpaces,
      groupedPetSpaces: this.groupPetSpaces(petSpaces),
    })
  },

  enterPet(e) {
    const id = e.currentTarget.dataset.id
    if (id) {
      wx.setStorageSync('selectedPetSpaceId', id)
    }

    wx.removeStorageSync('viewPetSpaceId')
    wx.removeStorageSync('viewSource')
    wx.setStorageSync('petDetailReturnTarget:v1', {
      type: 'navigateTo',
      url: '/pages/pet-list/index',
    })
    wx.switchTab({
      url: '/pages/pet-detail/index',
    })
  },

  createPet() {
    wx.navigateTo({
      url: '/pages/pet-create/index',
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
})
