const storage = require('../../utils/storage')
const auth = require('../../utils/auth')

const defaultPetImage = storage.defaultPetImage

Page({
  data: {
    petSpaceId: '',
    loading: false,
    saving: false,
    today: '',
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
    themes: [
      { id: 'cloud', name: '梦幻花谷', image: storage.themeImages.cloud },
      { id: 'rainbow', name: '日落花海', image: storage.themeImages.rainbow },
      { id: 'starry', name: '星空晨曦', image: storage.themeImages.starry },
      { id: 'sakura', name: '樱花大道', image: storage.themeImages.sakura },
    ],
    visibilityOptions: [
      { id: 'private', label: '仅自己可见', note: '不会出现在星空广场' },
      { id: 'share', label: '通过分享可见', note: '别人通过链接可查看' },
      { id: 'discover', label: '出现在星空广场', note: '可被随机遇见并轻互动' },
    ],
    selectedTheme: 'rainbow',
    petUploadGrant: '',
    pendingUploadedRefs: [],
  },

  noop() {},

  onLoad(options = {}) {
    if (!auth.requireLogin({ redirectToProfile: true })) {
      return
    }

    const petSpaceId = options.id || wx.getStorageSync('selectedPetSpaceId') || ''
    this.setData({
      petSpaceId,
      today: this.formatDate(new Date()),
    })
    this.loadPetSpace()
    this.loadPetUploadGrant()
  },

  onUnload() {
    this.cleanupPendingUploads().catch(() => {})
  },

  async loadPetSpace() {
    if (!wx.cloud || !this.data.petSpaceId) {
      wx.showToast({ title: '缺少宠物小窝', icon: 'none' })
      return
    }

    this.setData({ loading: true })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getMyPetSpaces',
        data: {},
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '读取宠物小窝失败')
      }

      const pet = (result.petSpaces || []).find((item) => item._id === this.data.petSpaceId)
      if (!pet) {
        throw new Error('没有找到这个小窝')
      }

      this.fillForm(pet)
    } catch (error) {
      wx.showToast({
        title: error.message || '读取宠物小窝失败',
        icon: 'none',
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadPetUploadGrant() {
    if (!wx.cloud || !this.data.petSpaceId) {
      return
    }

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getPetUploadGrant',
        data: {
          petSpaceId: this.data.petSpaceId,
          sessionGrant: auth.getSessionGrant(),
        },
      })

      if (result && result.ok) {
        this.setData({ petUploadGrant: result.petUploadGrant || '' })
      }
    } catch (error) {
      // Upload will fail later if authorization could not be refreshed.
    }
  },

  fillForm(pet = {}) {
    const ref = pet.avatarRef || pet.coverRef || null
    this.setData({
      selectedTheme: pet.theme || 'rainbow',
      form: {
        petName: pet.petName || '',
        petType: pet.petType || 'cat',
        breed: pet.breed || '',
        gender: pet.gender || 'unknown',
        lifeStatus: pet.lifeStatus || 'with_me',
        birthDate: pet.birthDate || '',
        arrivalDate: pet.arrivalDate || '',
        deathDate: pet.deathDate || '',
        story: pet.story || '',
        visibility: pet.visibility || 'private',
        coverUrl: pet.avatarUrl || pet.coverUrl || defaultPetImage,
        coverRef: ref,
        coverChanged: false,
      },
    })
  },

  onPetPhotoChange(e) {
    this.setData({
      'form.coverUrl': e.detail.tempFilePath,
      'form.coverChanged': true,
    })
  },

  onNameInput(e) {
    this.setData({ 'form.petName': e.detail.value })
  },

  onBreedInput(e) {
    this.setData({ 'form.breed': e.detail.value })
  },

  onStoryInput(e) {
    this.setData({ 'form.story': e.detail.value })
  },

  setPetType(e) {
    this.setData({ 'form.petType': e.currentTarget.dataset.type })
  },

  setGender(e) {
    this.setData({ 'form.gender': e.currentTarget.dataset.gender })
  },

  setLifeStatus(e) {
    const status = e.currentTarget.dataset.status
    this.setData({
      'form.lifeStatus': status,
      'form.deathDate': status === 'in_stars' ? this.data.form.deathDate : '',
    })
  },

  onDateChange(e) {
    const field = e.currentTarget.dataset.field
    if (field) {
      this.setData({ [`form.${field}`]: e.detail.value })
    }
  },

  selectTheme(e) {
    this.setData({ selectedTheme: e.currentTarget.dataset.id })
  },

  setVisibility(e) {
    this.setData({ 'form.visibility': e.currentTarget.dataset.visibility })
  },

  validateForm() {
    const form = this.data.form

    if (!form.petName.trim()) {
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

    return true
  },

  async savePetSpace() {
    if (this.data.saving || !this.validateForm()) {
      return
    }

    this.setData({ saving: true })

    try {
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
        name: 'updatePetSpace',
        data: {
          petSpaceId: this.data.petSpaceId,
          sessionGrant: auth.getSessionGrant(),
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
        throw new Error((result && result.message) || '保存失败')
      }

      wx.setStorageSync('selectedPetSpaceId', result.petSpace._id)
      this.setData({ pendingUploadedRefs: [] })
      wx.showToast({ title: '已保存', icon: 'success' })

      setTimeout(() => {
        wx.navigateBack()
      }, 500)
    } catch (error) {
      await this.cleanupPendingUploads().catch(() => {})
      wx.showToast({
        title: error.message || '保存失败，请稍后重试',
        icon: 'none',
      })
    } finally {
      this.setData({ saving: false })
    }
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
