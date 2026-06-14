const storage = require('../../utils/storage')
const auth = require('../../utils/auth')

const defaultPetImage = storage.defaultPetImage
const themeBackgrounds = storage.themeImages
const ownerCooldownMs = 10 * 60 * 1000
const petDetailCacheKey = 'petDetailCache:v1'
const petDetailReturnTargetKey = 'petDetailReturnTarget:v1'

Page({
  data: {
    isLoggedIn: false,
    loadingPet: false,
    hasPet: false,
    pet: null,
    rawPet: null,
    customTopbarStyle: '',
    customHeroStyle: '',
    hideTabBarForMemorial: false,
    identityClaiming: false,
    isOwner: false,
    canSharePet: false,
    viewingPetSpaceId: '',
    viewingSource: '',
    interactionSyncing: false,
    syncingInteractionType: '',
    actions: [],
    primaryAction: null,
    quickActions: [],
    stats: [],
    statsGridClass: 'stats-four',
    entryStats: {
      memoryText: '0 条记录',
      mediaText: '0 张照片',
    },
    storySectionTitle: '最近记录',
    visitorOverviewText: '',
    showVisitorOverview: false,
    visitorSummary: {
      visitorCountToday: 0,
      visitorInteractionCountToday: 0,
      visitorCountAllTime: 0,
    },
    recentMemories: [],
    timelineNodes: [],
    albumPreviewImages: [],
    reviewNotice: null,
    skeletonActions: [1, 2, 3],
    skeletonStats: [1, 2, 3, 4],
    defaultPetImage,
  },

  onLoad(options = {}) {
    this.applyCustomNavigationLayout()
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

  onHide() {
    this.showNativeTabBar()
  },

  onUnload() {
    this.showNativeTabBar()
  },

  hideNativeTabBar() {
    if (wx.hideTabBar) {
      wx.hideTabBar({ animation: false })
    }
  },

  showNativeTabBar() {
    if (wx.showTabBar) {
      wx.showTabBar({ animation: false })
    }
  },

  applyCustomNavigationLayout() {
    let statusBarHeight = 24
    let capsuleBottom = 56

    try {
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      statusBarHeight = windowInfo.statusBarHeight || statusBarHeight
    } catch (error) {
      // Keep the default inset when system metrics are unavailable.
    }

    try {
      const capsule = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect()
      if (capsule && capsule.bottom) {
        capsuleBottom = capsule.bottom
      }
    } catch (error) {
      capsuleBottom = statusBarHeight + 42
    }

    const topbarTop = Math.max(statusBarHeight + 6, 12)
    const heroTop = Math.max(capsuleBottom + 18, 74)

    this.setData({
      customTopbarStyle: `padding-top: ${topbarTop}px;`,
      customHeroStyle: `padding-top: ${heroTop}px;`,
    })
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
        hideTabBarForMemorial: false,
        stats: [],
        entryStats: this.getEntryStats(),
        recentMemories: [],
        timelineNodes: [],
        albumPreviewImages: [],
        reviewNotice: null,
      })
      this.syncNativeTabBar()
      this.updateNavigationTitle()
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
          hideTabBarForMemorial: false,
          stats: [],
          recentMemories: [],
        })
        this.syncNativeTabBar()
        this.updateNavigationTitle()
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
      rawPet.stats = displayStats
      const timelineNodes = this.buildTimelineNodes(rawPet, memorySummary.recentMemories)
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
        timelineNodes,
        albumPreviewImages: this.getAlbumPreviewImages(memorySummary.recentMemories, pet.avatar),
        ...this.buildActionState(rawPet.lifeStatus, isOwner, interactionSummary.todayCounts, displayStats),
        stats: this.normalizeStats(displayStats, rawPet.lifeStatus, isOwner, interactionSummary),
        statsGridClass: this.getStatsGridClass(displayStats, rawPet.lifeStatus, isOwner, interactionSummary),
        entryStats: this.getEntryStats(displayStats, interactionSummary),
        visitorSummary: this.normalizeVisitorSummary(interactionSummary),
        visitorOverviewText: this.getVisitorOverviewText(interactionSummary),
        showVisitorOverview: this.shouldShowVisitorOverview(rawPet, isOwner),
        reviewNotice: this.getReviewNotice(rawPet, isOwner),
        storySectionTitle: this.getStorySectionTitle(rawPet.lifeStatus, isOwner),
      })
      this.syncNativeTabBar(rawPet)
      this.updateNavigationTitle(pet)
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
      rawPet.stats = displayStats
    const timelineNodes = this.buildTimelineNodes(rawPet, memorySummary.recentMemories)

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
      timelineNodes,
      albumPreviewImages: this.getAlbumPreviewImages(memorySummary.recentMemories, pet.avatar),
      ...this.buildActionState(rawPet.lifeStatus, isOwner, interactionSummary.todayCounts, displayStats),
      stats: this.normalizeStats(displayStats, rawPet.lifeStatus, isOwner, interactionSummary),
      statsGridClass: this.getStatsGridClass(displayStats, rawPet.lifeStatus, isOwner, interactionSummary),
      entryStats: this.getEntryStats(displayStats, interactionSummary),
      visitorSummary: this.normalizeVisitorSummary(interactionSummary),
      visitorOverviewText: this.getVisitorOverviewText(interactionSummary),
      showVisitorOverview: this.shouldShowVisitorOverview(rawPet, isOwner),
      reviewNotice: this.getReviewNotice(rawPet, isOwner),
      storySectionTitle: this.getStorySectionTitle(rawPet.lifeStatus, isOwner),
    })
    this.syncNativeTabBar(rawPet)
    this.updateNavigationTitle(pet)
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

    const cacheTodayCounts = this.getActionCountsMap(cache.actions || [])
    const actionState = this.buildActionState(
      cache.rawPet.lifeStatus,
      Boolean(cache.isOwner),
      cacheTodayCounts,
      cache.rawPet.stats || {},
    )

    this.setData({
      loadingPet: false,
      hasPet: true,
      pet: this.normalizePet(cache.rawPet),
      rawPet: cache.rawPet,
      isOwner: Boolean(cache.isOwner),
      canSharePet: Boolean(cache.canSharePet),
      viewingPetSpaceId: '',
      viewingSource: '',
      recentMemories: cache.recentMemories || [],
      timelineNodes: cache.timelineNodes || this.buildTimelineNodes(cache.rawPet, cache.recentMemories || []),
      albumPreviewImages: cache.albumPreviewImages || this.getAlbumPreviewImages(cache.recentMemories || [], cache.pet.avatar),
      actions: actionState.actions,
      primaryAction: actionState.primaryAction,
      quickActions: actionState.quickActions,
      stats: cache.stats || [],
      statsGridClass: cache.statsGridClass || 'stats-four',
      entryStats: cache.entryStats || this.getEntryStats(cache.rawPet.stats, cache.visitorSummary),
      visitorSummary: cache.visitorSummary || this.data.visitorSummary,
      visitorOverviewText: cache.visitorOverviewText || '',
      showVisitorOverview: this.shouldShowVisitorOverview(cache.rawPet, Boolean(cache.isOwner)),
      reviewNotice: cache.reviewNotice || null,
      storySectionTitle: this.getStorySectionTitle(cache.rawPet.lifeStatus, Boolean(cache.isOwner)),
    })
    this.syncNativeTabBar(cache.rawPet)
    this.updateNavigationTitle(this.normalizePet(cache.rawPet))
  },

  syncNativeTabBar(pet = this.data.rawPet) {
    const shouldHide = Boolean(pet && pet.lifeStatus === 'in_stars')
    if (this.data.hideTabBarForMemorial !== shouldHide) {
      this.setData({ hideTabBarForMemorial: shouldHide })
    }

    if (shouldHide) {
      this.hideNativeTabBar()
      return
    }

    this.showNativeTabBar()
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
      timelineNodes: this.data.timelineNodes,
      albumPreviewImages: this.data.albumPreviewImages,
      actions: this.data.actions,
      primaryAction: this.data.primaryAction,
      quickActions: this.data.quickActions,
      stats: this.data.stats,
      statsGridClass: this.data.statsGridClass,
      entryStats: this.data.entryStats,
      visitorSummary: this.data.visitorSummary,
      visitorOverviewText: this.data.visitorOverviewText,
      showVisitorOverview: this.data.showVisitorOverview,
      reviewNotice: this.data.reviewNotice,
      storySectionTitle: this.data.storySectionTitle,
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
          includeSummary: true,
        },
      })

      if (result && result.ok) {
        const memories = result.memories || []
        const summary = result.summary || {}
        const recentMemories = memories.map((item) => ({
          id: item._id,
          title: item.title || '今天的记录',
          content: item.content || '留下了这些照片。',
          date: item.memoryDate || '',
          type: item.type || 'daily',
          showOnTimeline: item.showOnTimeline === true,
          img: (item.mediaUrls || [])[0] || '',
        }))

        return {
          memoryCount: typeof summary.memoryCount === 'number' ? summary.memoryCount : null,
          mediaCount: typeof summary.mediaCount === 'number' ? summary.mediaCount : null,
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

  previewAvatar() {
    const pet = this.data.pet || {}
    if (!pet.avatar) {
      return
    }

    wx.previewImage({
      current: pet.avatar,
      urls: [pet.avatar],
    })
  },

  normalizePet(item = {}) {
    const lifeStatus = item.lifeStatus || 'with_me'
    const isInStars = lifeStatus === 'in_stars'
    const dateText = this.getDateText(item)
    const metrics = this.getPetMetrics(item)
    const identityClaimed = Boolean(item.identityClaimed || item.identityClaimedAt)
    const companionDays = this.getDaysSince(item.arrivalDate)
    const genderSymbolByType = {
      female: '♀',
      male: '♂',
      unknown: '',
    }

    return {
      id: item._id,
      identityNo: item.identityNo || '',
      identityClaimed,
      identityClaimedDate: this.normalizeCloudDate(item.identityClaimedAt),
      identityStatusText: item.identityStatus === 'archived' ? '已归档' : '永久保留',
      nfcStatusText: item.nfc && item.nfc.status === 'bound' ? '已绑定' : '未绑定',
      phaseText: isInStars ? '数字纪念档案' : '数字生命档案',
      spaceTitle: isInStars ? '纪念空间' : '小窝',
      timelineSectionTitle: isInStars ? '生命时间轴' : '成长时间轴',
      albumEntryLabel: isInStars ? '纪念相册' : '回忆相册',
      socialEntryLabel: isInStars ? '留言与星光' : '朋友圈',
      name: item.petName || '未命名小窝',
      breed: item.breed || '',
      gender: item.gender || 'unknown',
      genderSymbol: genderSymbolByType[item.gender || 'unknown'] || '',
      genderClass: item.gender || 'unknown',
      status: isInStars ? '已去星星' : '陪伴中',
      dateText,
      birthDate: item.birthDate || '',
      arrivalDate: item.arrivalDate || '',
      deathDate: item.deathDate || '',
      metrics,
      dayText: metrics.length ? metrics.join(' · ') : '日期待补充',
      companionDayNumber: companionDays === null ? 0 : companionDays,
      companionDayLabel: isInStars ? '陪伴了' : '陪伴了',
      avatar: item.avatarUrl || item.coverUrl || defaultPetImage,
      cover: themeBackgrounds[item.theme] || item.coverUrl || item.avatarUrl || defaultPetImage,
      story: item.story || '还没有故事，去写下第一段回忆吧。',
      quote: item.story || (isInStars ? '它的一生很短，但值得被认真记录。' : '把每一天的小事，都认真留在这里。'),
    }
  },

  updateNavigationTitle(pet = {}) {
    if (!wx.setNavigationBarTitle) {
      return
    }

    wx.setNavigationBarTitle({
      title: pet.spaceTitle === '纪念空间' ? '纪念空间' : '我的小窝',
    })
  },

  normalizeCloudDate(value) {
    if (!value) {
      return ''
    }

    if (typeof value === 'string') {
      return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ''
    }

    if (value instanceof Date) {
      return this.formatDateValue(value)
    }

    if (typeof value === 'object' && value.$date) {
      return this.normalizeCloudDate(value.$date)
    }

    return ''
  },

  formatDateValue(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
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
          visitorCountAllTime: result.visitorCountAllTime || 0,
        }
      }
    } catch (error) {
      // Summary is an enhancement; the interact API remains the source of truth.
    }

    return { todayCounts: {}, visitorCountToday: 0, visitorInteractionCountToday: 0, visitorCountAllTime: 0 }
  },

  normalizeActions(
    lifeStatus,
    isOwner = this.data.isOwner,
    todayCounts = {},
    stats = (this.data.rawPet && this.data.rawPet.stats) || {},
    syncingType = this.data.syncingInteractionType,
  ) {
    const limit = isOwner ? 10 : 1
    const decorate = (actions) => actions.map((item) => ({
      ...item,
      limit,
      todayCount: todayCounts[item.type] || 0,
      totalCount: stats[this.getInteractionStatField(item.type)] || 0,
      totalCountText: String(stats[this.getInteractionStatField(item.type)] || 0),
      syncing: item.type === syncingType,
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
        { label: '喂食', icon: 'https://qiniu.cdn.cl8023.com/project/star-pet/assets/icons/food.png', type: 'feed' },
        { label: '留爪印', icon: '/assets/icons/paw.svg', type: 'paw' },
      ])
    }

    return decorate([
      { label: '贴贴', icon: '/assets/icons/heart.svg', type: 'cuddle' },
      { label: '喂食', icon: 'https://qiniu.cdn.cl8023.com/project/star-pet/assets/icons/food.png', type: 'feed' },
      { label: '留爪印', icon: '/assets/icons/paw.svg', type: 'paw' },
      { label: '记录今天', icon: '/assets/icons/timeline.svg', type: 'checkin' },
    ])
  },

  buildActionState(
    lifeStatus,
    isOwner = this.data.isOwner,
    todayCounts = {},
    stats = (this.data.rawPet && this.data.rawPet.stats) || {},
    syncingType = this.data.syncingInteractionType,
  ) {
    const actions = this.normalizeActions(lifeStatus, isOwner, todayCounts, stats, syncingType)
    let primaryAction = null
    let quickActions = actions

    if (isOwner) {
      primaryAction = lifeStatus === 'in_stars'
        ? {
          type: 'checkin',
          label: '继续记录回忆',
          desc: '离去以后，日常和想念都还可以继续留下。',
          buttonText: '写一段新的回忆',
          icon: '/assets/icons/book.svg',
        }
        : {
          type: 'checkin',
          label: '记录今天',
          desc: '把今天的小事、照片和心情留在小窝里。',
          buttonText: '写下今天',
          icon: '/assets/icons/timeline.svg',
        }

      quickActions = actions.filter((item) => item.type !== 'checkin')
    }

    return {
      actions,
      primaryAction,
      quickActions,
    }
  },

  normalizeStats(stats = {}, lifeStatus, isOwner = this.data.isOwner, visitorSummary = this.data.visitorSummary) {
    return lifeStatus === 'in_stars'
      ? [
        { label: '想你', value: stats.missCount || 0 },
        { label: '送花', value: stats.flowerCount || 0 },
        { label: '星光', value: stats.starCount || 0 },
        { label: '回忆', value: stats.memoryCount || 0 },
        { label: '照片数', value: stats.mediaCount || 0 },
      ]
      : [
        { label: '贴贴', value: stats.cuddleCount || 0 },
        { label: '喂食', value: stats.feedCount || 0 },
        { label: '爪印', value: stats.pawCount || 0 },
        { label: '记录', value: stats.memoryCount || 0 },
        { label: '照片数', value: stats.mediaCount || 0 },
      ]
  },

  getEntryStats(stats = {}, visitorSummary = this.data.visitorSummary) {
    return {
      memoryText: `${stats.memoryCount || 0} 条记录`,
      mediaText: `${stats.mediaCount || 0} 张照片`,
      visitorText: `${(visitorSummary && visitorSummary.visitorCountAllTime) || 0} 访客`,
      friendHint: ((visitorSummary && visitorSummary.visitorCountAllTime) || 0) ? '去看看动态' : '还没有访客哦',
    }
  },

  getAlbumPreviewImages(memories = [], fallback = defaultPetImage) {
    const images = []
    memories.forEach((memory) => {
      if (memory.img && images.length < 2) {
        images.push(memory.img)
      }
    })

    if (!images.length && fallback) {
      images.push(fallback)
    }

    return images
  },

  buildTimelineNodes(rawPet = {}, recentMemories = []) {
    const nodes = []
    const addNode = (date, label, icon, active = false) => {
      if (!date || nodes.length >= 5) {
        return
      }

      nodes.push({
        id: `${date}-${label}`,
        date: date.replace(/-/g, '.'),
        label,
        icon,
        active,
      })
    }

    addNode(rawPet.birthDate, '出生', '生', false)
    addNode(rawPet.arrivalDate, '来到我身边', '到', false)

    recentMemories
      .filter((item) => item.showOnTimeline || ['growth', 'travel', 'birthday', 'health'].includes(item.type))
      .slice(0, 2)
      .forEach((item) => {
        addNode(item.date, item.title || '重要记录', this.getTimelineIcon(item.type), true)
      })

    if ((rawPet.lifeStatus || 'with_me') === 'in_stars') {
      addNode(rawPet.deathDate, '去了星星', '星', true)
    }

    return nodes
  },

  getTimelineIcon(type) {
    const iconByType = {
      growth: '长',
      travel: '游',
      birthday: '岁',
      health: '护',
    }

    return iconByType[type] || '记'
  },

  getInteractionStatField(type) {
    const fieldByType = {
      cuddle: 'cuddleCount',
      feed: 'feedCount',
      paw: 'pawCount',
      miss: 'missCount',
      flower: 'flowerCount',
      star: 'starCount',
    }

    return fieldByType[type] || ''
  },

  normalizeVisitorSummary(summary = {}) {
    return {
      visitorCountToday: summary.visitorCountToday || 0,
      visitorInteractionCountToday: summary.visitorInteractionCountToday || 0,
      visitorCountAllTime: summary.visitorCountAllTime || 0,
    }
  },

  getVisitorOverviewText(summary = this.data.visitorSummary) {
    const todayVisitors = summary.visitorCountToday || 0
    const todayInteractions = summary.visitorInteractionCountToday || 0
    const allTimeVisitors = summary.visitorCountAllTime || 0

    return `今日访客 ${todayVisitors} 位，互动 ${todayInteractions} 次；总访客 ${allTimeVisitors} 位。`
  },

  shouldShowVisitorOverview(pet = {}, isOwner = this.data.isOwner) {
    return Boolean(isOwner && pet.visibility && pet.visibility !== 'private')
  },

  getStatsGridClass(stats = {}, lifeStatus, isOwner = this.data.isOwner, visitorSummary = this.data.visitorSummary) {
    const count = this.normalizeStats(stats, lifeStatus, isOwner, visitorSummary).length
    if (count <= 4) {
      return 'stats-four'
    }

    if (count <= 6) {
      return 'stats-three'
    }

    return 'stats-mixed'
  },

  getStorySectionTitle(lifeStatus, isOwner) {
    if (!isOwner) {
      return lifeStatus === 'in_stars' ? '公开回忆' : '公开日常'
    }

    return lifeStatus === 'in_stars' ? '最近想念' : '今日记录'
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

  goBackFromMemorial() {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    if (pages.length > 1) {
      wx.navigateBack()
      return
    }

    this.showNativeTabBar()
    const returnTarget = this.consumePetDetailReturnTarget()
    if (returnTarget && returnTarget.url) {
      if (returnTarget.type === 'navigateTo') {
        wx.navigateTo({ url: returnTarget.url })
        return
      }

      wx.switchTab({ url: returnTarget.url })
      return
    }

    if (this.data.viewingSource === 'star_square') {
      this.goStarSpace()
      return
    }

    wx.switchTab({
      url: '/pages/index/index',
    })
  },

  consumePetDetailReturnTarget() {
    const target = wx.getStorageSync(petDetailReturnTargetKey)
    wx.removeStorageSync(petDetailReturnTargetKey)
    if (!target || typeof target !== 'object' || !target.url) {
      return null
    }

    return {
      type: target.type === 'navigateTo' ? 'navigateTo' : 'switchTab',
      url: target.url,
    }
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

    const spaceTitle = pet.spaceTitle === '纪念空间' ? '纪念空间' : '小窝'
    wx.showModal({
      title: '隐藏公开展示',
      content: `隐藏后${spaceTitle}会转为私密，不再出现在星空广场。`,
      confirmText: '隐藏',
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
          reason: '主人主动隐藏公开展示',
        },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '下架失败')
      }

      const rawPet = {
        ...this.data.rawPet,
        visibility: 'private',
        reviewStatus: 'not_required',
      }
      this.setData({
        rawPet,
        canSharePet: this.canSharePet(rawPet),
        showVisitorOverview: false,
        reviewNotice: this.getReviewNotice(rawPet, this.data.isOwner),
      })
      this.savePetDetailCache()
      wx.showToast({ title: '已隐藏公开展示', icon: 'none' })
      this.refreshPetDetail()
    } catch (error) {
      wx.showToast({ title: error.message || '下架失败，请稍后重试', icon: 'none' })
    }
  },

  async interact(e) {
    if (!this.requireLoginToProfile('请先到“我的”登录后再互动')) {
      return
    }

    if (this.data.interactionSyncing) {
      return
    }

    const type = e.currentTarget.dataset.type
    const pet = this.data.pet

    if (!type || !pet || !pet.id) {
      return
    }

    if (type === 'checkin') {
      const entryMode = (this.data.rawPet && this.data.rawPet.lifeStatus) === 'in_stars' ? 'memorial' : 'daily'
      wx.navigateTo({
        url: `/pages/memory-create/index?petSpaceId=${pet.id}&entryMode=${entryMode}`,
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

    this.setData({
      interactionSyncing: true,
      syncingInteractionType: type,
    })
    this._interactionSnapshot = {
      rawPet: this.data.rawPet,
      actions: this.data.actions,
      quickActions: this.data.quickActions,
      stats: this.data.stats,
      entryStats: this.data.entryStats,
    }
    this.applyOptimisticInteraction(type)
    this.syncInteractionToServer(type)
  },

  applyOptimisticInteraction(type) {
    const rawPet = this.data.rawPet || {}
    const lifeStatus = rawPet.lifeStatus || 'with_me'
    const statField = this.getInteractionStatField(type)
    const nextStats = {
      ...(rawPet.stats || {}),
    }

    if (statField) {
      nextStats[statField] = (nextStats[statField] || 0) + 1
    }

    const nextRawPet = {
      ...rawPet,
      stats: nextStats,
    }
    const currentCounts = this.getActionCountsMap()
    const todayCounts = {
      ...currentCounts,
      [type]: (currentCounts[type] || 0) + 1,
    }
    const actions = this.normalizeActions(lifeStatus, this.data.isOwner, todayCounts, nextStats, type)

    this.setData({
      rawPet: nextRawPet,
      actions,
      quickActions: actions.filter((item) => item.type !== 'checkin'),
      stats: this.normalizeStats(nextStats, lifeStatus),
      entryStats: this.getEntryStats(nextStats),
    })
    this.savePetDetailCache()
  },

  async syncInteractionToServer(type) {
    const pet = this.data.pet
    if (!pet || !pet.id) {
      return
    }

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
        throw new Error((result && result.message) || '互动同步失败')
      }

      const rawStats = (this.data.rawPet && this.data.rawPet.stats) || {}
      const serverStats = result.stats || {}
      const nextStats = {
        ...serverStats,
        memoryCount: rawStats.memoryCount || 0,
        mediaCount: rawStats.mediaCount || 0,
      }
      ;['cuddleCount', 'feedCount', 'pawCount', 'missCount', 'flowerCount', 'starCount'].forEach((field) => {
        nextStats[field] = Math.max(rawStats[field] || 0, serverStats[field] || 0)
      })
      const rawPet = {
        ...this.data.rawPet,
        stats: nextStats,
      }
      const currentCounts = this.getActionCountsMap()
      const todayCounts = {
        ...currentCounts,
        [type]: Math.max(result.countToday || 0, currentCounts[type] || 0),
      }
      const actions = this.normalizeActions(rawPet.lifeStatus, this.data.isOwner, todayCounts, nextStats, '')

      if (this.data.isOwner && result.nextAllowedAt) {
        this.setLocalCooldown(type, result.nextAllowedAt)
      }

      this.setData({
        rawPet,
        interactionSyncing: false,
        syncingInteractionType: '',
        actions,
        quickActions: actions.filter((item) => item.type !== 'checkin'),
        stats: this.normalizeStats(nextStats, rawPet.lifeStatus),
        entryStats: this.getEntryStats(nextStats),
        visitorSummary: this.data.isOwner ? this.data.visitorSummary : this.normalizeVisitorSummary({}),
      })
      this._interactionSnapshot = null
      this.savePetDetailCache()
    } catch (error) {
      this.rollbackOptimisticInteraction()
      wx.showToast({
        title: error.message || '互动失败，请稍后重试',
        icon: 'none',
      })
    }
  },

  rollbackOptimisticInteraction() {
    const snapshot = this._interactionSnapshot
    this._interactionSnapshot = null

    if (!snapshot) {
      this.clearInteractionSyncState()
      return
    }

    this.setData({
      ...snapshot,
      interactionSyncing: false,
      syncingInteractionType: '',
    })
  },

  clearInteractionSyncState() {
    const rawPet = this.data.rawPet || {}
    const actions = this.normalizeActions(
      rawPet.lifeStatus || 'with_me',
      this.data.isOwner,
      this.getActionCountsMap(),
      rawPet.stats || {},
      '',
    )

    this.setData({
      interactionSyncing: false,
      syncingInteractionType: '',
      actions,
      quickActions: actions.filter((item) => item.type !== 'checkin'),
    })
  },

  getActionCountsMap(actions = this.data.actions) {
    return actions.reduce((map, item) => {
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
    const spaceTitle = pet.spaceTitle === '纪念空间' ? '纪念空间' : '小窝'
    const title = pet.name ? `来看看${pet.name}的${spaceTitle}` : `来看看这个宠物${spaceTitle}`

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

  triggerPrimaryAction() {
    const action = this.data.primaryAction
    const pet = this.data.pet
    if (!action || !pet || !pet.id) {
      return
    }

    if (action.type === 'checkin') {
      const entryMode = (this.data.rawPet && this.data.rawPet.lifeStatus) === 'in_stars' ? 'memorial' : 'daily'
      wx.navigateTo({
        url: `/pages/memory-create/index?petSpaceId=${pet.id}&entryMode=${entryMode}`,
      })
    }
  },

  goMoments() {
    const petSpaceId = this.data.pet && this.data.pet.id
    wx.navigateTo({ url: `/pages/moments/index?petSpaceId=${petSpaceId || ''}` })
  },

  goPetTimeline() {
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
    if (!pet.identityClaimed) {
      return
    }
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

  async claimIdentity() {
    const pet = this.data.pet || {}
    if (!this.data.isOwner || this.data.identityClaiming || !pet.id) {
      return
    }

    this.setData({ identityClaiming: true })
    wx.showLoading({ title: '正在生成编号...', mask: true })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'claimPetIdentity',
        data: { petSpaceId: pet.id },
      })

      if (!result || !result.ok || !result.petSpace) {
        throw new Error((result && result.message) || '领取爱宠身份证失败')
      }

      const claimedFields = result.petSpace
      const rawPet = {
        ...this.data.rawPet,
        identityNo: claimedFields.identityNo || this.data.rawPet.identityNo || '',
        identityToken: claimedFields.identityToken || this.data.rawPet.identityToken || '',
        identityClaimed: true,
        identityClaimedAt: claimedFields.identityClaimedAt || new Date().toISOString(),
      }
      const petView = this.normalizePet(rawPet)

      this.setData({
        identityClaiming: false,
        rawPet,
        pet: petView,
      })
      this.savePetDetailCache()
      wx.hideLoading()
      wx.showToast({
        title: '正在进入数字身份',
        icon: 'none',
      })
      setTimeout(() => {
        const token = rawPet.identityToken || ''
        if (token) {
          wx.navigateTo({
            url: `/pages/identity/index?token=${encodeURIComponent(token)}&playActivation=1`,
          })
          return
        }

        if (petView.identityNo) {
          wx.navigateTo({
            url: `/pages/identity/index?code=${encodeURIComponent(petView.identityNo)}&playActivation=1`,
          })
        }
      }, 250)
    } catch (error) {
      this.setData({ identityClaiming: false })
      wx.hideLoading()
      wx.showToast({
        title: error.message || '领取爱宠身份证失败',
        icon: 'none',
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
    if (!this.requireLoginToProfile('请先到“我的”登录后查看自己的宠物小窝')) {
      return
    }

    wx.removeStorageSync('viewPetSpaceId')
    wx.removeStorageSync('viewSource')
    this.refreshPetDetail()
  },
})
