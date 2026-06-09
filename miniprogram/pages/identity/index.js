const storage = require('../../utils/storage')

const defaultPetImage = '/assets/home/default-pet.png'
const qrCodeUrl = 'https://qiniu.cdn.cl8023.com/project/star-pet/assets/images/qrcode.jpg'
const themeBackgrounds = storage.themeImages
const templateOptions = [
  { id: 'resident', label: '居民证' },
  { id: 'growth', label: '成长档案' },
  { id: 'badge', label: '勋章战绩' },
]

Page({
  data: {
    loading: true,
    error: '',
    pet: null,
    activationStep: 0,
    activeTemplate: 'resident',
    templateOptions,
    posterBusy: false,
    posterPath: '',
    posterTemplateId: '',
    visitorOverviewText: '',
  },

  onLoad(options = {}) {
    this._activationTimers = []
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
      posterTemplateId: '',
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
      this.setData({
        loading: false,
        pet,
        activationStep: pet.identityActivatedAt ? 4 : 0,
        visitorOverviewText: `${pet.petName} 的身份编号 ${pet.identityNo} 已正式生效。`,
      })
      if (pet.identityActivatedAt) {
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
      residentDate: item.arrivalDate || item.birthDate || '',
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

  setTemplate(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.activeTemplate) {
      return
    }

    this.setData({
      activeTemplate: id,
      posterPath: '',
      posterTemplateId: '',
    })
  },

  openPetSpace() {
    const pet = this.data.pet

    if (!pet || !pet.id) {
      return
    }

    wx.setStorageSync('viewPetSpaceId', pet.id)
    wx.setStorageSync('viewSource', 'identity')
    wx.switchTab({
      url: '/pages/pet-detail/index',
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
    if (this.data.posterPath && this.data.posterTemplateId === this.data.activeTemplate) {
      return this.data.posterPath
    }

    if (this.data.posterBusy) {
      throw new Error('正在生成分享图')
    }

    this.setData({ posterBusy: true })
    wx.showLoading({ title: '生成分享图...', mask: true })

    try {
      const path = await this.drawPoster(this.data.activeTemplate)
      this.setData({
        posterBusy: false,
        posterPath: path,
        posterTemplateId: this.data.activeTemplate,
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

  async drawPoster(templateId) {
    const pet = this.data.pet
    if (!pet) {
      throw new Error('缺少身份信息')
    }

    const avatarPath = await this.getImagePath(pet.avatar)
    const qrPath = await this.getImagePath(qrCodeUrl, '')
    const width = 1080
    const height = 1440
    const ctx = wx.createCanvasContext('posterCanvas', this)
    const theme = this.getPosterTheme(templateId, pet.lifeStatus)

    ctx.setFillStyle(theme.background)
    ctx.fillRect(0, 0, width, height)

    this.drawPosterGlow(ctx, width, height, theme)
    this.drawPosterShell(ctx, 60, 60, width - 120, height - 120, theme)
    this.drawPosterHeader(ctx, width, pet, theme, templateId)
    this.drawPosterAvatar(ctx, avatarPath, width, theme)
    this.drawPosterFacts(ctx, pet, theme, templateId)
    this.drawPosterTags(ctx, pet.tags || [], theme, templateId)
    this.drawPosterFooter(ctx, width, height, pet, theme, templateId, qrPath)

    return new Promise((resolve, reject) => {
      ctx.draw(false, () => {
        wx.canvasToTempFilePath({
          canvasId: 'posterCanvas',
          width,
          height,
          destWidth: width,
          destHeight: height,
          fileType: 'png',
          quality: 1,
          success: (res) => resolve(res.tempFilePath),
          fail: () => reject(new Error('导出分享图失败')),
        }, this)
      })
    })
  },

  getPosterTheme(templateId, lifeStatus) {
    if (templateId === 'growth') {
      return {
        background: '#fff3e7',
        shell: '#fffaf5',
        shellBorder: '#efcfb0',
        title: '#543521',
        text: '#7a5c48',
        accent: '#e39164',
        chip: '#f8e5d4',
        footer: '#eca06d',
        panel: '#fff7ef',
        panelSoft: '#fffdfa',
        glowA: 'rgba(255, 220, 190, 0.6)',
        glowB: 'rgba(255, 238, 222, 0.78)',
      }
    }

    if (templateId === 'badge') {
      return {
        background: lifeStatus === 'in_stars' ? '#f7f1ff' : '#f1f4ff',
        shell: '#fffdfd',
        shellBorder: lifeStatus === 'in_stars' ? '#dccaf7' : '#cfd8ff',
        title: '#352547',
        text: '#6d618d',
        accent: lifeStatus === 'in_stars' ? '#b683ec' : '#7390f2',
        chip: lifeStatus === 'in_stars' ? '#f2e9ff' : '#edf1ff',
        footer: lifeStatus === 'in_stars' ? '#9079dc' : '#7594f0',
        panel: lifeStatus === 'in_stars' ? '#faf5ff' : '#f8f9ff',
        panelSoft: '#ffffff',
        glowA: lifeStatus === 'in_stars' ? 'rgba(232, 210, 255, 0.58)' : 'rgba(212, 225, 255, 0.6)',
        glowB: 'rgba(255,255,255,0.74)',
      }
    }

    return {
      background: '#fff1e6',
      shell: '#fffaf4',
      shellBorder: '#e2c6a8',
      title: '#4e2c13',
      text: '#82614c',
      accent: '#ea8a6e',
      chip: '#f9e4d8',
      footer: '#ef8f73',
      panel: '#fff5eb',
      panelSoft: '#fffdf8',
      glowA: 'rgba(255, 216, 187, 0.62)',
      glowB: 'rgba(255, 232, 220, 0.76)',
    }
  },

  drawPosterGlow(ctx, width, height, theme) {
    ctx.setFillStyle(theme.glowA || 'rgba(255,255,255,0.45)')
    ctx.beginPath()
    ctx.arc(width / 2, 128, 248, 0, Math.PI * 2)
    ctx.fill()

    ctx.setFillStyle(theme.glowB || 'rgba(255,255,255,0.24)')
    ctx.beginPath()
    ctx.arc(width - 132, 242, 190, 0, Math.PI * 2)
    ctx.fill()

    ctx.setFillStyle('rgba(255,255,255,0.22)')
    ctx.beginPath()
    ctx.arc(150, height - 220, 180, 0, Math.PI * 2)
    ctx.fill()

    ctx.setStrokeStyle(theme.shellBorder)
    ctx.setLineWidth(2)
    ctx.strokeRect(84, 84, width - 168, height - 168)
  },

  drawPosterShell(ctx, x, y, w, h, theme) {
    ctx.setFillStyle(theme.shell)
    this.roundRect(ctx, x, y, w, h, 38)
    ctx.fill()
    ctx.setStrokeStyle(theme.shellBorder)
    ctx.setLineWidth(5)
    ctx.stroke()
  },

  drawPosterHeader(ctx, width, pet, theme, templateId) {
    const titleMap = {
      resident: '星宠乡居民证',
      growth: '星宠乡成长档案',
      badge: '星宠乡身份徽章',
    }

    ctx.setFillStyle(theme.title)
    ctx.setFontSize(56)
    ctx.setTextAlign('center')
    ctx.setTextBaseline('middle')
    ctx.fillText(titleMap[templateId] || '星宠乡居民证', width / 2, 154)

    ctx.setFillStyle(theme.accent)
    ctx.setFontSize(24)
    this.drawWrappedText(ctx, pet.shareCaption || '', 180, 206, 720, 34, 2, 'center')

    ctx.setFillStyle(theme.text)
    ctx.setFontSize(20)
    ctx.fillText('STAR PET HOMELAND', width / 2, 274)
  },

  drawPosterAvatar(ctx, avatarPath, width, theme) {
    const size = 244
    const x = 110
    const y = 318

    ctx.setFillStyle('#ffffff')
    this.roundRect(ctx, x - 10, y - 10, size + 20, size + 20, 36)
    ctx.fill()
    ctx.setStrokeStyle(theme.shellBorder)
    ctx.setLineWidth(6)
    ctx.stroke()

    ctx.setFillStyle(theme.panel)
    this.roundRect(ctx, x - 18, y + size - 24, size + 36, 54, 28)
    ctx.fill()

    ctx.save()
    this.roundRect(ctx, x, y, size, size, 30)
    ctx.clip()
    ctx.drawImage(avatarPath, x, y, size, size)
    ctx.restore()

    ctx.setFillStyle(theme.title)
    ctx.setFontSize(30)
    ctx.setTextAlign('center')
    ctx.fillText(this.data.pet.petName || '', x + size / 2, y + size + 10)
  },

  drawPosterFacts(ctx, pet, theme, templateId) {
    const startX = 410
    let currentY = 326

    ctx.setTextAlign('left')
    ctx.setTextBaseline('top')

    ;(pet.facts || []).slice(0, 5).forEach((item, index) => {
      ctx.setFillStyle(theme.text)
      ctx.setFontSize(26)
      ctx.fillText(`${item.label}：`, startX, currentY)

      ctx.setFillStyle(index === 3 || item.label === '居民编号' ? theme.accent : theme.title)
      ctx.setFontSize(item.label === '居民编号' ? 34 : 32)
      this.drawWrappedText(ctx, item.value || '-', startX + 150, currentY - 2, 360, 38, item.label === '居民编号' ? 2 : 1)

      currentY += item.label === '居民编号' ? 84 : 70
    })

    if (templateId === 'growth' && pet.story) {
      ctx.setFillStyle(theme.panel)
      this.roundRect(ctx, 100, 592, 880, 142, 30)
      ctx.fill()
      ctx.setFillStyle(theme.text)
      ctx.setFontSize(24)
      this.drawWrappedText(ctx, `“${pet.story}”`, 128, 622, 824, 36, 3)
    }
  },

  drawPosterTags(ctx, tags, theme, templateId) {
    const startY = templateId === 'growth' ? 778 : 730
    const chipWidth = 258
    const gap = 18
    const startX = 114

    ctx.setFillStyle(theme.title)
    ctx.setFontSize(26)
    ctx.setTextAlign('center')
    ctx.fillText(templateId === 'badge' ? '已解锁身份勋章' : '本居民已获得', 540, startY - 34)

    ;(tags || []).slice(0, 3).forEach((tag, index) => {
      const x = startX + index * (chipWidth + gap)
      ctx.setFillStyle(theme.chip)
      this.roundRect(ctx, x, startY, chipWidth, 82, 24)
      ctx.fill()
      ctx.setStrokeStyle(theme.shellBorder)
      ctx.setLineWidth(3)
      ctx.stroke()

      ctx.setFillStyle(theme.accent)
      ctx.setFontSize(22)
      ctx.fillText('✦', x + 34, startY + 42)
      ctx.setFillStyle(theme.title)
      ctx.setFontSize(24)
      ctx.setTextAlign('left')
      ctx.fillText(tag, x + 62, startY + 28)
    })
  },

  drawPosterFooter(ctx, width, height, pet, theme, templateId, qrPath) {
    const footerY = height - 272
    const cardX = 92
    const cardW = width - 184

    ctx.setFillStyle(theme.footer)
    this.roundRect(ctx, cardX, footerY, cardW, 188, 34)
    ctx.fill()

    ctx.setFillStyle('rgba(255,255,255,0.14)')
    this.roundRect(ctx, cardX + 20, footerY + 18, cardW - 40, 152, 28)
    ctx.fill()

    ctx.setFillStyle('#fffefc')
    this.roundRect(ctx, cardX + 26, footerY + 28, 116, 116, 24)
    ctx.fill()

    if (qrPath) {
      ctx.drawImage(qrPath, cardX + 36, footerY + 38, 96, 96)
    }

    ctx.setTextAlign('left')
    ctx.setTextBaseline('top')
    ctx.setFillStyle('#ffffff')
    ctx.setFontSize(28)
    ctx.fillText(pet.posterHint || '扫码进入完整档案', cardX + 172, footerY + 40)
    ctx.setFontSize(20)
    ctx.setFillStyle('rgba(255,255,255,0.82)')
    this.drawWrappedText(
      ctx,
      templateId === 'badge' ? '带上身份徽章，去主页看看它的专属记录。' : '打开小程序，查看它的轻互动、照片和完整生活档案。',
      cardX + 172,
      footerY + 82,
      470,
      30,
      2
    )

    ctx.setTextAlign('right')
    ctx.setFillStyle('#ffffff')
    ctx.setFontSize(19)
    ctx.fillText(`编号 ${pet.identityNo}`, cardX + cardW - 32, footerY + 56)
    ctx.fillText('STAR PET HOMELAND', cardX + cardW - 32, footerY + 100)
    ctx.fillText('可保存到相册分享', cardX + cardW - 32, footerY + 132)
  },

  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
  },

  drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines, align = 'left') {
    const content = text || ''
    const charsPerLine = Math.max(8, Math.floor(maxWidth / 28))
    ctx.setTextAlign(align)

    for (let index = 0; index < maxLines; index += 1) {
      const start = index * charsPerLine
      if (start >= content.length) {
        break
      }

      let line = content.slice(start, start + charsPerLine)
      if (index === maxLines - 1 && start + charsPerLine < content.length) {
        line = `${line.slice(0, Math.max(0, line.length - 1))}…`
      }
      ctx.fillText(line, x, y + index * lineHeight)
    }
  },

  getImagePath(src, fallback = defaultPetImage) {
    return new Promise((resolve) => {
      if (!src) {
        resolve(fallback)
        return
      }

      wx.getImageInfo({
        src,
        success: (res) => resolve(res.path),
        fail: () => resolve(fallback),
      })
    })
  },

  goHome() {
    wx.switchTab({
      url: '/pages/index/index',
    })
  },
})
