const storage = require('../../utils/storage')
const illustratedTemplate = require('./templates/illustrated/config')
const illustratedPoster = require('./templates/illustrated/poster')
const residentTemplate = require('./templates/resident/config')
const residentPoster = require('./templates/resident/poster')

const defaultPetImage = storage.defaultPetImage
const themeBackgrounds = storage.themeImages
const TEMPLATES = {
  illustrated: {
    config: illustratedTemplate,
    drawPoster: illustratedPoster.drawPoster,
  },
  resident: {
    config: residentTemplate,
    drawPoster: residentPoster.drawPoster,
  },
}

Page({
  data: {
    loading: true,
    error: '',
    pet: null,
    activationStep: 0,
    activeTemplate: 'illustrated',
    posterBusy: false,
    posterPath: '',
    templateOptions: [
      { id: 'illustrated', name: '插画档案' },
      { id: 'resident', name: '居民身份卡' },
    ],
    visitorOverviewText: '',
    posterCanvasStyle: '',
    posterCanvasWidth: 0,
    posterCanvasHeight: 0,
  },

  onLoad(options = {}) {
    this._activationTimers = []
    this.applyActiveTemplate(this.data.activeTemplate)
    this.resolveIdentity(options)
  },

  onUnload() {
    this.clearActivationTimers()
  },

  async resolveIdentity(options = {}) {
    if (!wx.cloud) {
      this.setData({ loading: false, error: '请先开通云开发' })
      return
    }

    const token = options.token || ''
    const identityNo = options.code || options.identityNo || ''
    const forcePlayActivation = options.playActivation === '1'

    if (!token && !identityNo) {
      this.setData({ loading: false, error: '缺少宠物身份编号' })
      return
    }

    this.setData({
      loading: true,
      error: '',
      pet: null,
      activationStep: 0,
      posterPath: '',
    })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'resolvePetIdentity',
        data: {
          token,
          identityNo,
        },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '身份解析失败')
      }

      const pet = this.normalizePet(result.petSpace)
      const shouldPlayActivation = forcePlayActivation || Boolean(result.justActivated)
      this.setData({
        loading: false,
        pet,
        activationStep: shouldPlayActivation ? 0 : (pet.identityActivatedAt ? 4 : 0),
        visitorOverviewText: `${pet.petName} 的身份编号 ${pet.identityNo} 已正式生效。`,
      })
      if (!shouldPlayActivation && pet.identityActivatedAt) {
        return
      }

      this.startActivationSequence()
    } catch (error) {
      this.setData({
        loading: false,
        error: error.message || '身份解析失败，请稍后重试',
      })
    }
  },

  normalizePet(item = {}) {
    const nfc = item.nfc || {}
    const isInStars = item.lifeStatus === 'in_stars'
    const petType = item.petType || 'other'
    const breed = item.breed || this.getPetTypeLabel(petType)
    const story = item.story || ''

    return {
      id: item._id,
      identityNo: item.identityNo || '未生成',
      identityStatusText: item.identityStatus === 'archived' ? '已归档' : '永久保留',
      identityActivatedAt: item.identityActivatedAt || '',
      nfcStatusText: nfc.status === 'bound' ? '已绑定' : '未绑定',
      petName: item.petName || '未命名宠物',
      petType,
      gender: item.gender || 'unknown',
      genderSymbol: this.getGenderSymbol(item.gender),
      breed,
      phaseText: isInStars ? '数字纪念档案' : '数字生命档案',
      subline: isInStars ? '爱会继续被保存' : '星宠乡正式居民',
      birthDate: item.birthDate || '',
      arrivalDate: item.arrivalDate || '',
      deathDate: item.deathDate || '',
      lifeStatus: item.lifeStatus || 'with_me',
      avatar: item.avatarUrl || item.coverUrl || defaultPetImage,
      cover: themeBackgrounds[item.theme] || item.coverUrl || item.avatarUrl || defaultPetImage,
      story,
      oneLineDescription: story || (isInStars ? `想念${item.petName || '它'}的每一天。` : `${item.petName || '它'}正在星宠乡认真生活。`),
      heroStatement: isInStars
        ? `${item.petName || '它'}已经把陪伴写成了永远有效的纪念身份。`
        : `${item.petName || '它'}已经正式领取星宠乡身份编号。`,
      tags: this.buildIdentityTags(item),
      facts: this.buildFacts(item, breed, isInStars),
      shareCaption: isInStars
        ? `我把${item.petName || '它'}的思念也登记进了星宠乡。`
        : `${item.petName || '它'}正式成为星宠乡居民，快来看看它的身份卡。`,
      posterHint: isInStars ? '扫码进入纪念档案' : '扫码看看它的小窝',
    }
  },

  getPetTypeLabel(type) {
    if (type === 'cat') {
      return '小猫居民'
    }

    if (type === 'dog') {
      return '小狗居民'
    }

    return '特别居民'
  },

  getGenderSymbol(gender) {
    if (gender === 'male') {
      return '♂'
    }

    if (gender === 'female') {
      return '♀'
    }

    return ''
  },

  buildIdentityTags(item = {}) {
    const isInStars = item.lifeStatus === 'in_stars'
    if (isInStars) {
      return ['想念收藏家', '星光点亮者', '回忆守护员']
    }

    if (item.petType === 'dog') {
      return ['贴贴高手', '零食鉴赏家', '散步搭子']
    }

    if (item.petType === 'cat') {
      return ['贴贴高手', '巡窗观察员', '罐头鉴赏家']
    }

    return ['日常治愈官', '陪伴专家', '好奇侦探']
  },

  buildFacts(item = {}, breed, isInStars) {
    const facts = [
      { label: '居民姓名', value: item.petName || '未命名宠物' },
      { label: '种族', value: breed },
      { label: '居民编号', value: item.identityNo || '未生成' },
    ]

    if (item.arrivalDate) {
      facts.splice(2, 0, { label: '入住时间', value: item.arrivalDate })
    } else if (item.birthDate) {
      facts.splice(2, 0, { label: '出生日期', value: item.birthDate })
    }

    if (isInStars && item.deathDate) {
      facts.push({ label: '纪念开始', value: item.deathDate })
    }

    return facts
  },

  startActivationSequence() {
    this.clearActivationTimers()
    this.setData({ activationStep: 1 })

    ;[2, 3, 4].forEach((step, index) => {
      const timer = setTimeout(() => {
        this.setData({ activationStep: step })
      }, [480, 1080, 1680][index])
      this._activationTimers.push(timer)
    })
  },

  clearActivationTimers() {
    ;(this._activationTimers || []).forEach((timer) => clearTimeout(timer))
    this._activationTimers = []
  },

  getActiveTemplate() {
    return TEMPLATES[this.data.activeTemplate] || TEMPLATES.illustrated
  },

  applyActiveTemplate(templateId) {
    const template = TEMPLATES[templateId] || TEMPLATES.illustrated
    const { posterWidthPx, posterHeightPx } = template.config.layout
    this.setData({
      activeTemplate: template.config.id,
      posterCanvasStyle: `width: ${posterWidthPx}px; height: ${posterHeightPx}px;`,
      posterCanvasWidth: posterWidthPx,
      posterCanvasHeight: posterHeightPx,
    })
  },

  selectTemplate(e) {
    const templateId = e.currentTarget.dataset.template
    if (!templateId || templateId === this.data.activeTemplate) {
      return
    }

    this.applyActiveTemplate(templateId)
    this.setData({ posterPath: '' })
  },

  openPetSpace() {
    const pet = this.data.pet

    if (!pet || !pet.id) {
      return
    }

    wx.setStorageSync('viewPetSpaceId', pet.id)
    wx.setStorageSync('viewSource', 'identity')
    wx.setStorageSync('petDetailReturnTarget:v1', {
      type: 'navigateTo',
      url: `/pages/identity/index?code=${encodeURIComponent(pet.identityNo)}`,
    })
    wx.switchTab({
      url: '/pages/pet-detail/index',
    })
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

  copyIdentityNo() {
    const pet = this.data.pet

    if (!pet || !pet.identityNo) {
      return
    }

    wx.setClipboardData({
      data: pet.identityNo,
    })
  },

  async previewPoster() {
    try {
      const path = await this.ensurePoster()
      wx.previewImage({
        current: path,
        urls: [path],
      })
    } catch (error) {
      wx.showToast({ title: error.message || '生成分享图失败', icon: 'none' })
    }
  },

  async savePoster() {
    try {
      const path = await this.ensurePoster()
      await this.saveImageToAlbum(path)
      wx.showToast({ title: '已保存到相册', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    }
  },

  async ensurePoster() {
    if (this.data.posterPath) {
      return this.data.posterPath
    }

    if (this.data.posterBusy) {
      throw new Error('正在生成分享图')
    }

    this.setData({ posterBusy: true })
    wx.showLoading({ title: '生成分享图...', mask: true })

    try {
      const path = await this.drawPoster()
      this.setData({
        posterBusy: false,
        posterPath: path,
      })
      wx.hideLoading()
      return path
    } catch (error) {
      this.setData({ posterBusy: false })
      wx.hideLoading()
      throw error
    }
  },

  saveImageToAlbum(filePath) {
    return new Promise((resolve, reject) => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: resolve,
        fail: (error) => {
          if ((error.errMsg || '').includes('auth deny')) {
            reject(new Error('请在设置中允许保存到相册'))
            return
          }

          reject(error)
        },
      })
    })
  },

  async drawPoster() {
    const pet = this.data.pet
    if (!pet) {
      throw new Error('缺少身份信息')
    }

    const template = this.getActiveTemplate()
    return template.drawPoster({
      page: this,
      canvasId: 'posterCanvas',
      pet,
    })
  },

  goHome() {
    wx.switchTab({
      url: '/pages/index/index',
    })
  },
})
