const storage = require('../../utils/storage')

const defaultPetImage = storage.defaultPetImage
const themeBackgrounds = storage.themeImages
const tabs = [
  { id: 'all', label: '全部' },
  { id: 'growth', label: '成长' },
  { id: 'travel', label: '旅行' },
  { id: 'daily', label: '日常' },
  { id: 'birthday', label: '生日' },
  { id: 'health', label: '健康' },
]

const typeLabels = tabs.reduce((map, item) => {
  map[item.id] = item.label
  return map
}, {})
typeLabels.birth = '成长'
typeLabels.arrival = '成长'
typeLabels.farewell = '纪念'
typeLabels.identity = '身份'

Page({
  data: {
    tabs,
    skeletonDays: [1, 2, 3],
    activeTab: 'all',
    petSpaceId: '',
    pet: {
      name: '宠物小窝',
      avatar: defaultPetImage,
      cover: defaultPetImage,
    },
    defaultPetImage,
    initialLoading: true,
    loading: false,
    groups: [],
    dirtyVersion: 0,
    isOwner: false,
    pageCopy: {
      navTitle: '朋友圈',
      coverTitle: '宠物小窝的朋友圈',
      coverSubtitle: '把每一天都发给未来的自己看',
      loadingText: '正在读取动态...',
      emptyTitle: '还没有朋友圈动态',
      emptyDesc: '记录一次日常，宠物小窝的朋友圈就会更新。',
      readError: '读取朋友圈失败',
    },
  },

  onLoad(options = {}) {
    const entryMode = options.entryMode === 'memorial' ? 'memorial' : 'daily'
    const initialPet = {
      ...this.data.pet,
      lifeStatus: entryMode === 'memorial' ? 'in_stars' : 'with_me',
    }
    this.setData({
      petSpaceId: options.petSpaceId || wx.getStorageSync('selectedPetSpaceId') || '',
      pet: initialPet,
      pageCopy: this.getPageCopy(initialPet),
      dirtyVersion: this.getDirtyVersion(),
    })
    this.updateNavigationTitle()
    this.initializeTimeline()
  },

  onShow() {
    const dirtyVersion = this.getDirtyVersion()
    if (this.data.petSpaceId && dirtyVersion !== this.data.dirtyVersion) {
      this.setData({ dirtyVersion })
      this.initializeTimeline()
    }
  },

  async initializeTimeline() {
    if (!this.data.groups.length) {
      this.setData({ initialLoading: true })
    }

    const loaded = await this.loadPetProfile()
    if (!loaded) {
      this.setData({ initialLoading: false })
      return
    }
    this.loadMemories()
  },

  async loadPetProfile() {
    try {
      if (this.data.petSpaceId) {
        const { result } = await wx.cloud.callFunction({
          name: 'getPetSpaceDetail',
          data: {
            petSpaceId: this.data.petSpaceId,
            source: wx.getStorageSync('viewSource') || 'moments',
          },
        })

        if (result && result.ok && result.petSpace) {
          const pet = this.normalizePet(result.petSpace)
          this.setData({
            petSpaceId: result.petSpace._id,
            pet,
            isOwner: Boolean(result.isOwner),
            pageCopy: this.getPageCopy(pet),
          })
          this.updateNavigationTitle()
          return true
        }

        if (result && !result.ok) {
          throw new Error(result.message || '无法访问这个宠物档案')
        }
      }

      const { result } = await wx.cloud.callFunction({
        name: 'getMyPetSpaces',
        data: {},
      })

      if (!result || !result.ok) {
        return false
      }

      const rawList = result.petSpaces || []
      const selected = rawList.find((item) => item._id === this.data.petSpaceId) || rawList[0]

      if (!selected) {
        return false
      }

      const pet = this.normalizePet(selected)
      this.setData({
        petSpaceId: selected._id,
        pet,
        isOwner: true,
        pageCopy: this.getPageCopy(pet),
      })
      this.updateNavigationTitle()

      return true
    } catch (error) {
      this.setData({ loading: false, groups: [] })
      wx.showToast({
        title: error.message || '无法访问这个宠物档案',
        icon: 'none',
      })
      return false
    }
  },

  selectTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (!tab || tab === this.data.activeTab) {
      return
    }

    this.setData({ activeTab: tab })
    this.loadMemories()
  },

  async loadMemories() {
    if (!this.data.petSpaceId || this.data.loading) {
      return
    }

    this.setData({ loading: true })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getMemories',
        data: {
          petSpaceId: this.data.petSpaceId,
          type: this.getMemoryQueryType(),
          limit: 80,
        },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || this.data.pageCopy.readError)
      }

      this.setData({
        loading: false,
        initialLoading: false,
        dirtyVersion: this.getDirtyVersion(),
        groups: this.groupTimelineItems(result.memories || []),
      })
    } catch (error) {
      this.setData({ loading: false, initialLoading: false, groups: [] })
      wx.showToast({
        title: error.message || this.data.pageCopy.readError,
        icon: 'none',
      })
    }
  },

  getMemoryQueryType() {
    return this.data.activeTab === 'growth' ? 'all' : this.data.activeTab
  },

  groupTimelineItems(memories) {
    const groups = []
    const groupMap = {}
    const items = [
      ...this.getSystemEvents(),
      ...memories.map((memory) => this.normalizeMemory(memory)),
    ]
      .filter((item) => item.memoryDate)
      .filter((item) => this.data.activeTab === 'all' || item.type === this.data.activeTab || item.category === this.data.activeTab)
      .sort((left, right) => {
        if (left.memoryDate === right.memoryDate) {
          return (right.sortOrder || 0) - (left.sortOrder || 0)
        }

        return right.memoryDate.localeCompare(left.memoryDate)
      })

    items.forEach((item) => {
      const key = item.memoryDate || 'unknown'

      if (!groupMap[key]) {
        groupMap[key] = {
          key,
          year: item.year,
          date: item.date,
          items: [],
          countText: '',
        }
        groups.push(groupMap[key])
      }

      groupMap[key].items.push(item)
      groupMap[key].countText = `${groupMap[key].items.length}条动态`
    })

    return groups
  },

  getSystemEvents() {
    const pet = this.data.pet || {}
    const name = pet.name || '宠物'
    const events = []

    if (pet.birthDate) {
      events.push(this.createSystemEvent({
        id: 'system-birth',
        date: pet.birthDate,
        title: `${name} 出生了`,
        desc: '这一天，是生命档案的起点。',
        type: 'birth',
        category: 'growth',
        typeLabel: '成长',
        sortOrder: 30,
      }))
    }

    if (pet.arrivalDate) {
      events.push(this.createSystemEvent({
        id: 'system-arrival',
        date: pet.arrivalDate,
        title: `${name} 来到身边`,
        desc: '从这一天起，彼此的生活有了新的陪伴。',
        type: 'arrival',
        category: 'growth',
        typeLabel: '成长',
        sortOrder: 20,
      }))
    }

    if (pet.deathDate) {
      events.push(this.createSystemEvent({
        id: 'system-farewell',
        date: pet.deathDate,
        title: `${name} 去了星星`,
        desc: '陪伴进入纪念，爱会继续被保存。',
        type: 'farewell',
        category: 'all',
        typeLabel: '纪念',
        sortOrder: 10,
      }))
    }

    if (pet.identityClaimedDate) {
      events.push(this.createSystemEvent({
        id: 'system-identity',
        date: pet.identityClaimedDate,
        title: `${name} 获得数字身份`,
        desc: pet.identityNo ? `身份编号 ${pet.identityNo}` : '这份档案将被长期保留。',
        type: 'identity',
        category: 'all',
        typeLabel: '身份',
        sortOrder: 5,
      }))
    }

    return events
  },

  createSystemEvent(event) {
    return {
      id: event.id,
      memoryDate: event.date,
      year: event.date.slice(0, 4) || '未知',
      date: this.formatDate(event.date),
      title: event.title,
      desc: event.desc,
      type: event.type,
      category: event.category,
      typeLabel: event.typeLabel,
      img: '',
      mediaUrls: [],
      photoCount: 0,
      isSystem: true,
      sortOrder: event.sortOrder || 0,
    }
  },

  normalizeMemory(item = {}) {
    const date = item.memoryDate || ''
    const mediaUrls = item.mediaUrls || []

    return {
      id: item._id,
      memoryDate: date,
      year: date.slice(0, 4) || '未知',
      date: this.formatDate(date),
      title: item.title || typeLabels[item.type] || '今天的记录',
      desc: item.content || '这一天留下了这些照片。',
      type: item.type,
      category: this.getMemoryCategory(item.type),
      typeLabel: typeLabels[item.type] || '日常',
      img: mediaUrls[0] || '',
      mediaUrls,
      photoCount: mediaUrls.length,
      isSystem: false,
      sortOrder: item.sortOrder || 0,
    }
  },

  getMemoryCategory(type) {
    if (type === 'birth' || type === 'home') {
      return 'growth'
    }

    return type || 'daily'
  },

  normalizePet(item = {}) {
    return {
      name: item.petName || '宠物小窝',
      avatar: item.avatarUrl || item.coverUrl || defaultPetImage,
      cover: themeBackgrounds[item.theme] || defaultPetImage,
      lifeStatus: item.lifeStatus || 'with_me',
      birthDate: item.birthDate || '',
      arrivalDate: item.arrivalDate || '',
      deathDate: item.deathDate || '',
      identityNo: item.identityNo || '',
      identityClaimedDate: this.normalizeCloudDate(item.identityClaimedAt),
    }
  },

  getPageCopy(pet = {}) {
    const name = pet.name || '宠物小窝'
    const isInStars = pet.lifeStatus === 'in_stars'

    if (isInStars) {
      return {
        navTitle: '回忆动态',
        coverTitle: `${name}的回忆动态`,
        coverSubtitle: '把想念、照片和回忆都好好留下',
        loadingText: '正在读取回忆...',
        emptyTitle: '还没有回忆动态',
        emptyDesc: `记录一段回忆，${name}的纪念空间就会更新。`,
        readError: '读取回忆失败',
      }
    }

    return {
      navTitle: '朋友圈',
      coverTitle: `${name}的朋友圈`,
      coverSubtitle: '把每一天都发给未来的自己看',
      loadingText: '正在读取动态...',
      emptyTitle: '还没有朋友圈动态',
      emptyDesc: `记录一次日常，${name}的朋友圈就会更新。`,
      readError: '读取朋友圈失败',
    }
  },

  updateNavigationTitle() {
    if (!wx.setNavigationBarTitle) {
      return
    }

    wx.setNavigationBarTitle({
      title: this.data.pageCopy.navTitle,
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

  formatDate(dateText) {
    const parts = dateText.split('-')
    if (parts.length !== 3) {
      return '日期待补充'
    }

    return `${parts[0]}年${Number(parts[1])}月${Number(parts[2])}日`
  },

  goMemoryDetail(e) {
    const memoryId = e.currentTarget.dataset.id
    const isSystem = e.currentTarget.dataset.system === true || e.currentTarget.dataset.system === 'true'

    if (isSystem) {
      wx.showToast({
        title: this.data.isOwner ? '可在宠物资料中修改' : '这是系统生命节点',
        icon: 'none',
      })
      return
    }

    if (!memoryId) {
      return
    }

    wx.navigateTo({
      url: `/pages/memory-detail/index?petSpaceId=${this.data.petSpaceId}&memoryId=${memoryId}`,
    })
  },

  goCreateMemory() {
    if (!this.data.isOwner || !this.data.petSpaceId) {
      return
    }

    const entryMode = (this.data.pet && this.data.pet.lifeStatus) === 'in_stars' ? 'memorial' : 'daily'
    wx.navigateTo({
      url: `/pages/memory-create/index?petSpaceId=${this.data.petSpaceId}&entryMode=${entryMode}`,
    })
  },

  previewMemoryImage(e) {
    const memoryId = e.currentTarget.dataset.id
    const url = e.currentTarget.dataset.url

    if (!memoryId || !url) {
      return
    }

    const memory = this.data.groups.reduce((found, group) => {
      if (found) {
        return found
      }

      return group.items.find((item) => item.id === memoryId)
    }, null)

    if (!memory || !memory.mediaUrls.length) {
      return
    }

    wx.previewImage({
      current: url,
      urls: memory.mediaUrls,
    })
  },

  previewPetAvatar() {
    const pet = this.data.pet || {}
    if (!pet.avatar) {
      return
    }

    wx.previewImage({
      current: pet.avatar,
      urls: [pet.avatar],
    })
  },

  getDirtyVersion() {
    return Number(wx.getStorageSync('memoryListDirty') || 0)
  },
})
