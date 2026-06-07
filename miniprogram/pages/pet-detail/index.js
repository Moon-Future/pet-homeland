const auth = require('../../utils/auth')

const defaultPetImage = '/assets/home/default-pet.png'
const themeBackgrounds = {
  cloud: 'https://qiniu.cdn.cl8023.com/project/star-paws/themes/cloud-garden.png',
  rainbow: 'https://qiniu.cdn.cl8023.com/project/star-paws/themes/sunset-flowers.png',
  starry: 'https://qiniu.cdn.cl8023.com/project/star-paws/themes/starry-sky.png',
  sakura: 'https://qiniu.cdn.cl8023.com/project/star-paws/themes/sakura-avenue.png',
}
const ownerCooldownMs = 10 * 60 * 1000
const petDetailCacheKey = 'petDetailCache:v1'

Page({
  data: {
    isLoggedIn: false,
    loadingPet: false,
    hasPet: false,
    pet: null,
    rawPet: null,
    interacting: false,
    isOwner: false,
    canSharePet: false,
    viewingPetSpaceId: '',
    viewingSource: '',
    actions: [],
    stats: [],
    visitorSummary: {
      visitorCountToday: 0,
      visitorInteractionCountToday: 0,
    },
    recentMemories: [],
    reviewNotice: null,
    skeletonActions: [1, 2, 3],
    skeletonStats: [1, 2, 3, 4],
  },

  onLoad(options = {}) {
    this._skipNextShow = true
    this.applyShareEntrance(options)
    this.refreshPetDetail({ useCache: true })
  },

  onShow() {
    if (this._skipNextShow) {
      this._skipNextShow = false
      return
    }

    this.refreshPetDetail({ useCache: true, silent: this.data.hasPet })
  },

  refreshPetDetail(options = {}) {
    const isLoggedIn = auth.isLoggedIn()
    const viewingPetSpaceId = wx.getStorageSync('viewPetSpaceId') || ''
    this.setData({ isLoggedIn })

    if (!isLoggedIn && !viewingPetSpaceId) {
      this.setData({
        loadingPet: false,
        hasPet: false,
        pet: null,
        stats: [],
        recentMemories: [],
        reviewNotice: null,
      })
      return
    }

    if (options.useCache) {
      this.applyPetDetailCache()
    }

    this.loadPetDetail({ silent: options.silent || this.data.hasPet })
  },

  async loadPetDetail(options = {}) {
    if (!wx.cloud) {
      wx.showToast({ title: '请先开通云开发', icon: 'none' })
      return
    }

    if (!options.silent) {
      this.setData({ loadingPet: true })
    }

    try {
      const viewingPetSpaceId = wx.getStorageSync('viewPetSpaceId') || ''
      const storedSource = wx.getStorageSync('viewSource') || ''
      const viewingSource = storedSource === 'admin_review' ? '' : storedSource

      if (viewingPetSpaceId) {
        await this.loadViewingPetDetail(viewingPetSpaceId, viewingSource)
        return
      }

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
          recentMemories: [],
        })
        return
      }

      const pet = this.normalizePet(rawPet)
      const currentUser = auth.getUserProfile() || {}
      const isOwner = rawPet.ownerOpenid === currentUser.openid
      const [interactionSummary, memorySummary] = await Promise.all([
        this.loadInteractionSummary(rawPet._id),
        this.loadMemorySummary(rawPet._id),
      ])
      const displayStats = {
        ...(rawPet.stats || {}),
        memoryCount: memorySummary.memoryCount !== null ? memorySummary.memoryCount : ((rawPet.stats || {}).memoryCount || 0),
        mediaCount: memorySummary.mediaCount !== null ? memorySummary.mediaCount : ((rawPet.stats || {}).mediaCount || 0),
      }
      this.setData({
        loadingPet: false,
        hasPet: true,
        pet,
        rawPet,
        isOwner,
        canSharePet: this.canSharePet(rawPet),
        viewingPetSpaceId: '',
        viewingSource: '',
        recentMemories: memorySummary.recentMemories,
        actions: this.normalizeActions(rawPet.lifeStatus, isOwner, interactionSummary.todayCounts),
        stats: this.normalizeStats(displayStats, rawPet.lifeStatus),
        visitorSummary: this.normalizeVisitorSummary(interactionSummary),
        reviewNotice: this.getReviewNotice(rawPet, isOwner),
      })
      this.savePetDetailCache()
    } catch (error) {
      this.setData({
        loadingPet: false,
        hasPet: this.data.hasPet,
        pet: this.data.pet,
        stats: this.data.stats,
        recentMemories: this.data.recentMemories,
      })
      wx.showToast({
        title: error.message || '读取宠物小窝失败',
        icon: 'none',
      })
    }
  },

  async loadViewingPetDetail(petSpaceId, viewingSource = '') {
    const { result } = await wx.cloud.callFunction({
      name: 'getPetSpaceDetail',
      data: { petSpaceId, source: viewingSource },
    })

    if (!result || !result.ok) {
      throw new Error((result && result.message) || '读取宠物小窝失败')
    }

    const rawPet = result.petSpace
    const pet = this.normalizePet(rawPet)
    const isOwner = Boolean(result.isOwner)
    const [interactionSummary, memorySummary] = await Promise.all([
      this.loadInteractionSummary(rawPet._id),
      this.loadMemorySummary(rawPet._id),
    ])
    const displayStats = {
      ...(rawPet.stats || {}),
      memoryCount: memorySummary.memoryCount !== null ? memorySummary.memoryCount : ((rawPet.stats || {}).memoryCount || 0),
      mediaCount: memorySummary.mediaCount !== null ? memorySummary.mediaCount : ((rawPet.stats || {}).mediaCount || 0),
    }

    this.setData({
      loadingPet: false,
      hasPet: true,
      pet,
      rawPet,
      isOwner,
      canSharePet: this.canSharePet(rawPet),
      viewingPetSpaceId: petSpaceId,
      viewingSource,
      recentMemories: memorySummary.recentMemories,
      actions: this.normalizeActions(rawPet.lifeStatus, isOwner, interactionSummary.todayCounts),
      stats: this.normalizeStats(displayStats, rawPet.lifeStatus),
      visitorSummary: this.normalizeVisitorSummary(interactionSummary),
      reviewNotice: this.getReviewNotice(rawPet, isOwner),
    })
  },

  applyPetDetailCache() {
    if (wx.getStorageSync('viewPetSpaceId') || this.data.hasPet) {
      return
    }

    const cache = wx.getStorageSync(petDetailCacheKey)
    if (!cache || !cache.pet || !cache.rawPet) {
      return
    }

    const selectedId = wx.getStorageSync('selectedPetSpaceId')
    if (selectedId && cache.rawPet._id && selectedId !== cache.rawPet._id) {
      return
    }

    this.setData({
      loadingPet: false,
      hasPet: true,
      pet: cache.pet,
      rawPet: cache.rawPet,
      isOwner: Boolean(cache.isOwner),
      canSharePet: Boolean(cache.canSharePet),
      viewingPetSpaceId: '',
      viewingSource: '',
      recentMemories: cache.recentMemories || [],
      actions: cache.actions || [],
      stats: cache.stats || [],
      visitorSummary: cache.visitorSummary || this.data.visitorSummary,
      reviewNotice: cache.reviewNotice || null,
    })
  },

  savePetDetailCache() {
    if (this.data.viewingPetSpaceId || !this.data.pet || !this.data.rawPet) {
      return
    }

    wx.setStorageSync(petDetailCacheKey, {
      pet: this.data.pet,
      rawPet: this.data.rawPet,
      isOwner: this.data.isOwner,
      canSharePet: this.data.canSharePet,
      recentMemories: this.data.recentMemories,
      actions: this.data.actions,
      stats: this.data.stats,
      visitorSummary: this.data.visitorSummary,
      reviewNotice: this.data.reviewNotice,
      cachedAt: Date.now(),
    })
  },

  async loadMemorySummary(petSpaceId) {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getMemories',
        data: {
          petSpaceId,
          limit: 3,
        },
      })

      if (result && result.ok) {
        const memories = result.memories || []
        const recentMemories = memories.map((item) => ({
          id: item._id,
          title: item.title || '今天的记录',
          content: item.content || '留下了这些照片。',
          date: item.memoryDate || '',
          img: (item.mediaUrls || [])[0] || '',
        }))

        return {
          memoryCount: null,
          mediaCount: null,
          recentMemories,
        }
      }
    } catch (error) {
      // Recent memories are an enhancement; the pet detail can still render.
    }

    return {
      memoryCount: null,
      mediaCount: null,
      recentMemories: [],
    }
  },

  normalizePet(item = {}) {
    const lifeStatus = item.lifeStatus || 'with_me'
    const isInStars = lifeStatus === 'in_stars'
    const dateText = this.getDateText(item)
    const metrics = this.getPetMetrics(item)

    return {
      id: item._id,
      identityNo: item.identityNo || '',
      identityStatusText: item.identityStatus === 'archived' ? '已归档' : '永久保留',
      nfcStatusText: item.nfc && item.nfc.status === 'bound' ? '已绑定' : '未绑定',
      phaseText: isInStars ? '数字纪念档案' : '数字生命档案',
      name: item.petName || '未命名小窝',
      status: isInStars ? '已去星星' : '陪伴中',
      dateText,
      metrics,
      dayText: metrics.length ? metrics.join(' · ') : '日期待补充',
      avatar: item.avatarTempUrl || item.coverTempUrl || item.avatarUrl || item.coverUrl || defaultPetImage,
      cover: themeBackgrounds[item.theme] || item.coverTempUrl || item.avatarTempUrl || item.coverUrl || item.avatarUrl || defaultPetImage,
      story: item.story || '还没有故事，去写下第一段回忆吧。',
    }
  },

  async loadInteractionSummary(petSpaceId) {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getPetInteractionSummary',
        data: { petSpaceId },
      })

      if (result && result.ok) {
        return {
          todayCounts: result.todayCounts || {},
          visitorCountToday: result.visitorCountToday || 0,
          visitorInteractionCountToday: result.visitorInteractionCountToday || 0,
        }
      }
    } catch (error) {
      // Summary is an enhancement; the interact API remains the source of truth.
    }

    return { todayCounts: {}, visitorCountToday: 0, visitorInteractionCountToday: 0 }
  },

  normalizeActions(lifeStatus, isOwner = this.data.isOwner, todayCounts = {}) {
    const limit = isOwner ? 10 : 1
    const decorate = (actions) => actions.map((item) => ({
      ...item,
      limit,
      todayCount: todayCounts[item.type] || 0,
      showCount: item.type !== 'checkin',
    }))

    if (lifeStatus === 'in_stars') {
      return decorate([
        { label: '想你了', icon: '/assets/icons/heart.svg', type: 'miss' },
        { label: '送花', icon: '/assets/icons/flower.svg', type: 'flower' },
        { label: '点亮星光', icon: '/assets/icons/star.svg', type: 'star' },
      ])
    }

    if (!isOwner) {
      return decorate([
        { label: '贴贴', icon: '/assets/icons/heart.svg', type: 'cuddle' },
        { label: '喂食', icon: '/assets/icons/flower.svg', type: 'feed' },
        { label: '留爪印', icon: '/assets/icons/paw.svg', type: 'paw' },
      ])
    }

    return decorate([
      { label: '贴贴', icon: '/assets/icons/heart.svg', type: 'cuddle' },
      { label: '喂食', icon: '/assets/icons/flower.svg', type: 'feed' },
      { label: '记录今天', icon: '/assets/icons/timeline.svg', type: 'checkin' },
    ])
  },

  normalizeStats(stats = {}, lifeStatus) {
    if (lifeStatus === 'in_stars') {
      return [
        { label: '想念', value: stats.missCount || 0 },
        { label: '回忆', value: stats.memoryCount || 0 },
        { label: '星光', value: stats.starCount || 0 },
        { label: '相册', value: stats.mediaCount || 0 },
      ]
    }

    return [
      { label: '记录', value: stats.memoryCount || 0 },
      { label: '贴贴', value: stats.cuddleCount || 0 },
      { label: '喂食', value: stats.feedCount || 0 },
      { label: '爪印', value: stats.pawCount || 0 },
      { label: '相册', value: stats.mediaCount || 0 },
    ]
  },

  normalizeVisitorSummary(summary = {}) {
    return {
      visitorCountToday: summary.visitorCountToday || 0,
      visitorInteractionCountToday: summary.visitorInteractionCountToday || 0,
    }
  },

  canSharePet(pet = {}) {
    if (pet.status && pet.status !== 'active') {
      return false
    }

    if (pet.visibility === 'share') {
      return true
    }

    return pet.visibility === 'discover' && (pet.reviewStatus || 'approved') === 'approved'
  },

  getReviewNotice(pet = {}, isOwner = this.data.isOwner) {
    if (!isOwner) {
      return null
    }

    const reviewStatus = pet.reviewStatus || 'approved'
    if (pet.visibility !== 'discover' && reviewStatus === 'approved') {
      return null
    }

    const noticeByStatus = {
      pending_review: {
        type: 'pending',
        text: '公开展示审核中，通过后会出现在星空广场。',
      },
      approved: {
        type: 'approved',
        text: pet.visibility === 'discover' ? '公开展示已通过审核。' : '',
      },
      rejected: {
        type: 'rejected',
        text: '公开展示未通过审核，可修改后重新提交。',
      },
      hidden: {
        type: 'hidden',
        text: '公开展示已被管理员隐藏，可修改资料后重新提交公开申请。',
      },
    }

    const notice = noticeByStatus[reviewStatus]
    return notice && notice.text ? notice : null
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

  requireLoginToProfile(message = '请先到“我的”登录') {
    if (auth.isLoggedIn()) {
      return true
    }

    wx.showToast({
      title: message,
      icon: 'none',
    })

    return false
  },

  goCreate() {
    wx.navigateTo({
      url: '/pages/pet-create/index',
    })
  },

  goEditPet() {
    if (!this.data.isOwner || !this.requireLoginToProfile('请先到“我的”登录后再编辑') || !this.data.pet || !this.data.pet.id) {
      return
    }

    wx.navigateTo({
      url: `/pages/pet-edit/index?id=${this.data.pet.id}`,
    })
  },

  reportPet() {
    const pet = this.data.pet || {}
    if (!pet.id || !this.requireLoginToProfile('请先到“我的”登录后再举报')) {
      return
    }

    wx.showActionSheet({
      itemList: ['内容不适合公开展示', '疑似侵权或冒用', '其他原因'],
      success: async (res) => {
        const reasons = ['内容不适合公开展示', '疑似侵权或冒用', '其他原因']
        await this.submitReport(reasons[res.tapIndex] || reasons[0])
      },
    })
  },

  async submitReport(reason) {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'submitReport',
        data: {
          targetType: 'pet_space',
          targetId: this.data.pet.id,
          reason,
        },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '举报失败')
      }

      wx.showToast({ title: result.message || '已收到举报', icon: 'none' })
    } catch (error) {
      wx.showToast({ title: error.message || '举报失败，请稍后重试', icon: 'none' })
    }
  },

  unpublishPet() {
    const pet = this.data.pet || {}
    if (!pet.id || !this.data.isOwner || !this.requireLoginToProfile('请先到“我的”登录后再操作')) {
      return
    }

    wx.showModal({
      title: '下架公开展示',
      content: '下架后小窝会转为私密，不再出现在星空广场。',
      confirmText: '下架',
      confirmColor: '#8b5cf6',
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        await this.hideOwnPublicPet()
      },
    })
  },

  async hideOwnPublicPet() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'hidePublicContent',
        data: {
          targetType: 'pet_space',
          targetId: this.data.pet.id,
          action: 'unpublish',
          reason: '主人主动下架公开展示',
        },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '下架失败')
      }

      wx.showToast({ title: '已下架公开展示', icon: 'none' })
      this.refreshPetDetail()
    } catch (error) {
      wx.showToast({ title: error.message || '下架失败，请稍后重试', icon: 'none' })
    }
  },

  async interact(e) {
    if (this.data.interacting) {
      return
    }

    if (!this.requireLoginToProfile('请先到“我的”登录后再互动')) {
      return
    }

    const type = e.currentTarget.dataset.type
    const pet = this.data.pet

    if (!type || !pet || !pet.id) {
      return
    }

    if (type === 'checkin') {
      wx.navigateTo({
        url: `/pages/memory-create/index?petSpaceId=${pet.id}`,
      })
      return
    }

    const action = this.data.actions.find((item) => item.type === type)
    if (action && action.todayCount >= action.limit) {
      wx.showToast({ title: '今天这个互动次数已用完', icon: 'none' })
      return
    }

    const cooldown = this.getLocalCooldown(type)
    if (this.data.isOwner && cooldown > 0) {
      wx.showToast({ title: `${cooldown}分钟后可以再次互动`, icon: 'none' })
      return
    }

    this.setData({ interacting: true })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'interactPetSpace',
        data: {
          petSpaceId: pet.id,
          type,
          source: this.getInteractionSource(),
        },
      })

      if (!result || !result.ok) {
        if (result && result.nextAllowedAt) {
          this.setLocalCooldown(type, result.nextAllowedAt)
        }
        throw new Error((result && result.message) || '互动失败')
      }

      const rawPet = {
        ...this.data.rawPet,
        stats: result.stats,
      }
      const todayCounts = {
        ...this.getActionCountsMap(),
        [type]: result.countToday,
      }

      if (this.data.isOwner && result.nextAllowedAt) {
        this.setLocalCooldown(type, result.nextAllowedAt)
      }

      this.setData({
        interacting: false,
        rawPet,
        actions: this.normalizeActions(rawPet.lifeStatus, this.data.isOwner, todayCounts),
        stats: this.normalizeStats(result.stats, rawPet.lifeStatus),
        visitorSummary: this.data.isOwner ? this.data.visitorSummary : this.normalizeVisitorSummary({}),
      })

      wx.showToast({
        title: this.data.isOwner ? (result.message || '已记录') : this.getVisitorInteractionText(type, pet.name),
        icon: 'none',
      })
    } catch (error) {
      this.setData({ interacting: false })
      wx.showToast({
        title: error.message || '互动失败，请稍后重试',
        icon: 'none',
      })
    }
  },

  getActionCountsMap() {
    return this.data.actions.reduce((map, item) => {
      map[item.type] = item.todayCount || 0
      return map
    }, {})
  },

  getCooldownKey(type) {
    const pet = this.data.pet || {}
    return `petInteractionCooldown:${pet.id}:${type}`
  },

  getLocalCooldown(type) {
    const nextAllowedAt = Number(wx.getStorageSync(this.getCooldownKey(type)) || 0)
    if (!nextAllowedAt) {
      return 0
    }

    const remaining = nextAllowedAt - Date.now()
    if (remaining <= 0) {
      wx.removeStorageSync(this.getCooldownKey(type))
      return 0
    }

    return Math.ceil(remaining / 60000)
  },

  setLocalCooldown(type, nextAllowedAt) {
    const time = Number(nextAllowedAt)
    if (time) {
      wx.setStorageSync(this.getCooldownKey(type), time)
    }
  },

  applyShareEntrance(options = {}) {
    const petSpaceId = options.viewPetSpaceId || options.petSpaceId || ''

    if (!petSpaceId) {
      return
    }

    wx.setStorageSync('viewPetSpaceId', petSpaceId)
    wx.setStorageSync('viewSource', options.source === 'star_square' ? 'star_square' : 'share')
  },

  getInteractionSource() {
    if (this.data.isOwner) {
      return 'owner_detail'
    }

    return this.data.viewingSource || (this.data.viewingPetSpaceId ? 'star_square' : 'pet_detail')
  },

  onShareAppMessage() {
    const pet = this.data.pet || {}
    const petSpaceId = pet.id || this.data.viewingPetSpaceId || ''
    const title = pet.name ? `来看看${pet.name}的小窝` : '来看看这个宠物小窝'

    return {
      title,
      path: this.data.canSharePet && petSpaceId
        ? `/pages/pet-detail/index?viewPetSpaceId=${petSpaceId}&source=share`
        : '/pages/pet-detail/index',
      imageUrl: pet.avatar || '',
    }
  },

  getVisitorInteractionText(type, petName) {
    const name = petName || '它'
    const textByType = {
      cuddle: `和${name}贴贴了一下`,
      feed: `给${name}送来一份小零食`,
      paw: `给${name}留下了一个爪印`,
      miss: `为${name}记下一份想念`,
      flower: `给${name}送了一朵花`,
      star: `为${name}点亮一束星光`,
    }

    return textByType[type] || '已留下轻轻的问候'
  },

  goTimeline() {
    const petSpaceId = this.data.pet && this.data.pet.id
    wx.navigateTo({ url: `/pages/timeline/index?petSpaceId=${petSpaceId || ''}` })
  },

  goAlbum() {
    const petSpaceId = this.data.pet && this.data.pet.id
    wx.navigateTo({ url: `/pages/album/index?petSpaceId=${petSpaceId || ''}` })
  },

  goIdentity() {
    const rawPet = this.data.rawPet || {}
    const pet = this.data.pet || {}
    const token = rawPet.identityToken || ''
    const identityNo = pet.identityNo || rawPet.identityNo || ''

    if (token) {
      wx.navigateTo({
        url: `/pages/identity/index?token=${encodeURIComponent(token)}`,
      })
      return
    }

    if (identityNo) {
      wx.navigateTo({
        url: `/pages/identity/index?code=${encodeURIComponent(identityNo)}`,
      })
    }
  },

  goMemoryDetail(e) {
    const memoryId = e.currentTarget.dataset.id
    const petSpaceId = this.data.pet && this.data.pet.id

    if (!memoryId || !petSpaceId) {
      return
    }

    wx.navigateTo({
      url: `/pages/memory-detail/index?petSpaceId=${petSpaceId}&memoryId=${memoryId}`,
    })
  },

  goStarSpace() {
    wx.removeStorageSync('viewPetSpaceId')
    wx.removeStorageSync('viewSource')
    wx.switchTab({ url: '/pages/star-space/index' })
  },

  goMyPetSpace() {
    if (!this.requireLoginToProfile('请先到“我的”登录后查看自己的小窝')) {
      return
    }

    wx.removeStorageSync('viewPetSpaceId')
    wx.removeStorageSync('viewSource')
    this.refreshPetDetail()
  },
})
