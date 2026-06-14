const storage = require('../../utils/storage')
const auth = require('../../utils/auth')

const defaultPetImage = storage.defaultPetImage

Page({
  data: {
    currentStep: 1,
    saving: false,
    today: '',
    steps: [
      { id: 1, label: '上传照片' },
      { id: 2, label: '填写资料' },
      { id: 3, label: '选择主题' },
    ],
    form: {
      petName: '',
      petType: 'cat',
      breed: '',
      gender: 'unknown',
      lifeStatus: 'with_me',
      birthDate: '',
      arrivalDate: '',
      deathDate: '',
      story: '',
      visibility: 'private',
      coverUrl: defaultPetImage,
      coverRef: null,
      coverChanged: false,
    },
    petTypes: [
      { id: 'cat', label: '猫咪' },
      { id: 'dog', label: '狗狗' },
      { id: 'other', label: '其他' },
    ],
    genders: [
      { id: 'unknown', label: '未知' },
      { id: 'male', label: '男孩' },
      { id: 'female', label: '女孩' },
    ],
    themes: storage.getThemeOptionsForLifeStatus('with_me'),
    visibilityOptions: [
      { id: 'private', label: '仅自己可见', note: '不会出现在星空广场' },
      { id: 'share', label: '通过分享可见', note: '别人通过链接可查看' },
      { id: 'discover', label: '出现在星空广场', note: '可被随机遇见并轻互动' },
    ],
    selectedTheme: 'rainbow',
    reservedPetSpaceId: '',
    petUploadGrant: '',
    petUploadGrantReservedAt: 0,
    pendingUploadedRefs: [],
  },

  noop() {},

  onLoad() {
    if (!auth.requireLogin({
      redirectToProfile: true,
    })) {
      return
    }

    this.setData({
      today: this.formatDate(new Date()),
    })

    this.reservePetSpaceId({ showError: true }).catch(() => {})
  },

  onUnload() {
    this.cleanupPendingUploads().catch(() => {})
  },

  async reservePetSpaceId(options = {}) {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'reservePetSpaceId',
        data: {
          sessionGrant: auth.getSessionGrant(),
        },
      })
      if (result && result.ok) {
        this.setData({
          reservedPetSpaceId: result.petSpaceId,
          petUploadGrant: result.petUploadGrant || '',
          petUploadGrantReservedAt: Date.now(),
        })
        return result
      }

      throw new Error((result && result.message) || '小窝预留失败')
    } catch (error) {
      if (this.isGrantExpiredError(error) && !options.retried) {
        try {
          await auth.refreshSessionGrant()
          return this.reservePetSpaceId({ ...options, retried: true })
        } catch (refreshError) {
          const message = this.getFriendlyReserveError(refreshError)
          if (options.showError) {
            wx.showToast({ title: message, icon: 'none' })
          }
          throw new Error(message)
        }
      }

      const message = this.getFriendlyReserveError(error)
      if (options.showError) {
        wx.showToast({ title: message, icon: 'none' })
      }
      throw new Error(message)
    }
  },

  async ensureFreshPetSpaceReservation() {
    const grantAge = Date.now() - Number(this.data.petUploadGrantReservedAt || 0)
    const grantRefreshMs = 18 * 60 * 1000

    if (!this.data.reservedPetSpaceId || !this.data.petUploadGrant || grantAge > grantRefreshMs) {
      await this.reservePetSpaceId({ showError: true })
    }
  },

  isGrantExpiredError(error = {}) {
    const message = error.message || error.errMsg || ''
    return message.includes('grant 已过期')
      || message.includes('登录态已失效')
      || message.includes('登录已过期')
      || message.includes('上传授权已失效')
  },

  getFriendlyReserveError(error = {}) {
    const message = error.message || error.errMsg || ''
    if (this.isGrantExpiredError(error)) {
      return '登录已过期，请重新登录后再创建'
    }
    if (message.includes('grant 无效') || message.includes('grant 签名无效') || message.includes('登录态不匹配')) {
      return '登录状态异常，请重新登录后再创建'
    }
    return message || '创建准备失败，请稍后重试'
  },

  getFriendlyCreateError(error = {}) {
    const message = error.message || error.errMsg || ''
    if (this.isGrantExpiredError(error)) {
      return '登录已过期，请重新登录后再创建'
    }
    if (message.includes('grant 无效') || message.includes('grant 签名无效') || message.includes('登录态不匹配')) {
      return '登录状态异常，请重新登录后再创建'
    }
    return message || '创建失败，请稍后重试'
  },

  goStep(e) {
    const step = Number(e.currentTarget.dataset.step)
    if (!step || step === this.data.currentStep) {
      return
    }

    if (step > this.data.currentStep && !this.validateStep(this.data.currentStep)) {
      return
    }

    this.setData({ currentStep: step })
  },

  nextStep() {
    if (!this.validateStep(this.data.currentStep)) {
      return
    }

    if (this.data.currentStep < 3) {
      this.setData({
        currentStep: this.data.currentStep + 1,
      })
      return
    }

    this.createPetSpace()
  },

  prevStep() {
    if (this.data.currentStep <= 1 || this.data.saving) {
      return
    }

    this.setData({
      currentStep: this.data.currentStep - 1,
    })
  },

  onPetPhotoChange(e) {
    this.setData({
      'form.coverUrl': e.detail.tempFilePath,
      'form.coverChanged': true,
    })
  },

  onNameInput(e) {
    this.setData({
      'form.petName': e.detail.value,
    })
  },

  onBreedInput(e) {
    this.setData({
      'form.breed': e.detail.value,
    })
  },

  onStoryInput(e) {
    this.setData({
      'form.story': e.detail.value,
    })
  },

  setPetType(e) {
    this.setData({
      'form.petType': e.currentTarget.dataset.type,
    })
  },

  setGender(e) {
    this.setData({
      'form.gender': e.currentTarget.dataset.gender,
    })
  },

  setLifeStatus(e) {
    const status = e.currentTarget.dataset.status
    const selectedTheme = storage.resolveThemeForLifeStatus(this.data.selectedTheme, status)
    this.setData({
      'form.lifeStatus': status,
      'form.deathDate': status === 'in_stars' ? this.data.form.deathDate : '',
      themes: storage.getThemeOptionsForLifeStatus(status),
      selectedTheme,
    })
  },

  onDateChange(e) {
    const field = e.currentTarget.dataset.field
    if (!field) {
      return
    }

    this.setData({
      [`form.${field}`]: e.detail.value,
    })
  },

  selectTheme(e) {
    this.setData({
      selectedTheme: e.currentTarget.dataset.id,
    })
  },

  setVisibility(e) {
    this.setData({
      'form.visibility': e.currentTarget.dataset.visibility,
    })
  },

  validateStep(step) {
    if (step === 1 && !this.data.form.coverChanged && !this.data.form.coverRef) {
      wx.showToast({ title: '请先上传宠物照片', icon: 'none' })
      return false
    }

    if (step === 2) {
      const form = this.data.form
      const name = form.petName.trim()

      if (!name) {
        wx.showToast({ title: '请填写宝贝名字', icon: 'none' })
        return false
      }

      if (!form.birthDate && !form.arrivalDate) {
        wx.showToast({ title: '出生或来到身边日期至少填一个', icon: 'none' })
        return false
      }

      if (form.lifeStatus === 'in_stars' && !form.deathDate) {
        wx.showToast({ title: '请选择离去日期', icon: 'none' })
        return false
      }
    }

    if (step === 3 && !this.data.selectedTheme) {
      wx.showToast({ title: '请选择小窝主题', icon: 'none' })
      return false
    }

    return true
  },

  async createPetSpace() {
    if (this.data.saving || !wx.cloud) {
      return
    }

    this.setData({ saving: true })

    try {
      const result = await this.createPetSpaceWithRetry()
      this.handleCreateSuccess(result.petSpace)
    } catch (error) {
      await this.cleanupPendingUploads().catch(() => {})
      this.setData({ saving: false })
      wx.showToast({
        title: this.getFriendlyCreateError(error),
        icon: 'none',
      })
    }
  },

  async createPetSpaceWithRetry() {
    try {
      return await this.submitPetSpaceOnce()
    } catch (error) {
      if (!this.isGrantExpiredError(error)) {
        throw error
      }

      await this.cleanupPendingUploads().catch(() => {})
      await this.resetReservationForRetry()
      return this.submitPetSpaceOnce()
    }
  },

  async resetReservationForRetry() {
    try {
      await auth.refreshSessionGrant()
    } catch (error) {
      throw new Error(this.getFriendlyCreateError(error))
    }

    this.setData({
      reservedPetSpaceId: '',
      petUploadGrant: '',
      petUploadGrantReservedAt: 0,
    })
    await this.reservePetSpaceId({ showError: true })
  },

  async submitPetSpaceOnce() {
    // Defensive: if the initial reserve in onLoad is missing or stale, retry
    // synchronously here so the uploader has a valid petSpaceId and grant.
    await this.ensureFreshPetSpaceReservation()

    const uploader = this.selectComponent('#petCoverUploader')
    const upload = uploader
      ? await uploader.uploadCroppedImage()
      : { ref: this.data.form.coverRef, url: this.data.form.coverUrl, changed: false }

    const ref = upload.ref || this.data.form.coverRef

    if (!ref || !ref.key) {
      throw new Error('宠物照片上传失败，请重新选择照片')
    }
    this.addPendingRef(ref)

    const form = this.data.form
    const { result } = await wx.cloud.callFunction({
      name: 'createPetSpace',
      data: {
        _id: this.data.reservedPetSpaceId || undefined,
        sessionGrant: auth.getSessionGrant(),
        petUploadGrant: this.data.petUploadGrant,
        pet: {
          petName: form.petName,
          petType: form.petType,
          breed: form.breed,
          gender: form.gender,
          lifeStatus: form.lifeStatus,
          birthDate: form.birthDate,
          arrivalDate: form.arrivalDate,
          deathDate: form.lifeStatus === 'in_stars' ? form.deathDate : '',
          story: form.story,
          visibility: form.visibility,
          avatarRef: ref,
          coverRef: ref,
          theme: this.data.selectedTheme,
        },
      },
    })

    if (!result || !result.ok) {
      throw new Error((result && result.message) || '创建失败')
    }

    return result
  },

  handleCreateSuccess(petSpace) {
    wx.setStorageSync('selectedPetSpaceId', petSpace._id)
    this.setData({ pendingUploadedRefs: [] })
    this.setData({ saving: false })
    wx.showToast({ title: '创建成功', icon: 'success' })

    setTimeout(() => {
      wx.setStorageSync('petDetailReturnTarget:v1', {
        type: 'switchTab',
        url: '/pages/index/index',
      })
      wx.switchTab({
        url: '/pages/pet-detail/index',
      })
    }, 500)
  },

  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  addPendingRef(ref) {
    if (!ref || !ref.key) {
      return
    }
    const refs = this.data.pendingUploadedRefs || []
    if (refs.some((item) => item && item.key === ref.key)) {
      return
    }
    this.setData({ pendingUploadedRefs: refs.concat(ref) })
  },

  async cleanupPendingUploads() {
    const refs = this.data.pendingUploadedRefs || []
    if (!refs.length) {
      return
    }
    await storage.cleanupRefs(refs)
    this.setData({ pendingUploadedRefs: [] })
  },
})
