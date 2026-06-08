const auth = require('../../utils/auth')

const defaultPetImage = '/assets/home/default-pet.png'

Page({
  data: {
    loading: false,
    petSpaces: [],
    selectedPetId: '',
    selectedPet: null,
    summary: [
      { label: '宠物', value: 0 },
      { label: '回忆', value: 0 },
      { label: '照片', value: 0 },
      { label: '陪伴', value: 0 },
    ],
    typeStats: [],
    recentMemories: [],
  },

  onLoad() {
    if (!auth.requireLogin({ redirectToProfile: true })) {
      return
    }

    this.loadOverview()
  },

  async loadOverview() {
    if (this.data.loading) {
      return
    }

    this.setData({ loading: true })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getMyPetSpaces',
        data: {},
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '读取数据失败')
      }

      const petSpaces = (result.petSpaces || []).map((item) => this.normalizePet(item))
      const selectedPetId = this.data.selectedPetId || wx.getStorageSync('selectedPetSpaceId') || (petSpaces[0] && petSpaces[0].id) || ''
      const selectedPet = petSpaces.find((item) => item.id === selectedPetId) || petSpaces[0] || null
      const memoryData = selectedPet ? await this.loadMemories(selectedPet.id) : { memories: [] }

      this.setData({
        loading: false,
        petSpaces,
        selectedPetId: selectedPet ? selectedPet.id : '',
        selectedPet,
        ...this.buildOverview(petSpaces, selectedPet, memoryData.memories),
      })
    } catch (error) {
      this.setData({ loading: false })
      wx.showToast({
        title: error.message || '读取数据失败',
        icon: 'none',
      })
    }
  },

  async loadMemories(petSpaceId) {
    const { result } = await wx.cloud.callFunction({
      name: 'getMemories',
      data: {
        petSpaceId,
        limit: 100,
      },
    })

    if (!result || !result.ok) {
      throw new Error((result && result.message) || '读取回忆失败')
    }

    return {
      memories: result.memories || [],
    }
  },

  selectPet(e) {
    const petId = e.currentTarget.dataset.id
    if (!petId || petId === this.data.selectedPetId) {
      return
    }

    this.setData({ selectedPetId: petId })
    this.loadOverview()
  },

  buildOverview(petSpaces, selectedPet, memories) {
    const mediaCount = memories.reduce((total, item) => total + (item.mediaRefs || []).length, 0)
    const typeMap = {
      daily: { label: '日常', value: 0 },
      growth: { label: '成长', value: 0 },
      health: { label: '健康', value: 0 },
      travel: { label: '旅行', value: 0 },
      birthday: { label: '生日', value: 0 },
    }

    memories.forEach((item) => {
      const key = typeMap[item.type] ? item.type : 'daily'
      typeMap[key].value += 1
    })

    const memoryCount = memories.length

    return {
      summary: [
        { label: '宠物', value: petSpaces.length },
        { label: '回忆', value: memoryCount },
        { label: '照片', value: mediaCount },
        { label: '陪伴', value: selectedPet ? selectedPet.companionDays : 0 },
      ],
      typeStats: Object.keys(typeMap).map((key) => ({
        ...typeMap[key],
        percent: memoryCount ? Math.round(typeMap[key].value * 100 / memoryCount) : 0,
      })),
      recentMemories: memories.slice(0, 5).map((item) => ({
        id: item._id,
        title: item.title || '今天的记录',
        date: item.memoryDate || '',
        content: item.content || '留下了这些照片。',
      })),
    }
  },

  normalizePet(item = {}) {
    return {
      id: item._id,
      name: item.petName || '未命名小窝',
      avatar: item.avatarUrl || item.coverUrl || defaultPetImage,
      companionDays: this.getDaysSince(item.arrivalDate),
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

  goMemory(e) {
    const memoryId = e.currentTarget.dataset.id
    if (!memoryId || !this.data.selectedPetId) {
      return
    }

    wx.navigateTo({
      url: `/pages/memory-detail/index?petSpaceId=${this.data.selectedPetId}&memoryId=${memoryId}`,
    })
  },
})
