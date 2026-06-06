const auth = require('../../utils/auth')

const defaultPetImage = '/assets/home/default-pet.png'

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
      coverFileId: '',
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
      { id: 'cloud', name: '梦幻花谷', image: 'https://qiniu.cdn.cl8023.com/project/star-paws/themes/cloud-garden.png' },
      { id: 'rainbow', name: '日落花海', image: 'https://qiniu.cdn.cl8023.com/project/star-paws/themes/sunset-flowers.png' },
      { id: 'starry', name: '星空晨曦', image: 'https://qiniu.cdn.cl8023.com/project/star-paws/themes/starry-sky.png' },
      { id: 'sakura', name: '樱花大道', image: 'https://qiniu.cdn.cl8023.com/project/star-paws/themes/sakura-avenue.png' },
    ],
    visibilityOptions: [
      { id: 'private', label: '仅自己可见', note: '不会出现在星空广场' },
      { id: 'share', label: '通过分享可见', note: '别人通过链接可查看' },
      { id: 'discover', label: '出现在星空广场', note: '可被随机遇见并轻互动' },
    ],
    selectedTheme: 'rainbow',
  },

  onLoad() {
    if (!auth.requireLogin({
      redirectToProfile: true,
    })) {
      return
    }

    this.setData({
      today: this.formatDate(new Date()),
    })
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
    this.setData({
      'form.lifeStatus': status,
      'form.deathDate': status === 'in_stars' ? this.data.form.deathDate : '',
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
    if (step === 1 && !this.data.form.coverChanged && !this.data.form.coverFileId) {
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
      const uploader = this.selectComponent('#petCoverUploader')
      const upload = uploader
        ? await uploader.uploadCroppedImage()
        : {
            avatarUrl: this.data.form.coverUrl,
            avatarFileId: this.data.form.coverFileId,
          }
      const uploadedFileId = upload.avatarFileId || upload.coverFileId || upload.fileId || upload.fileID || ''

      if (!uploadedFileId || !uploadedFileId.startsWith('cloud://')) {
        throw new Error('宠物照片上传失败，请重新选择照片')
      }

      const form = this.data.form
      const { result } = await wx.cloud.callFunction({
        name: 'createPetSpace',
        data: {
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
            avatarUrl: upload.avatarUrl || uploadedFileId,
            avatarFileId: uploadedFileId,
            coverUrl: upload.coverUrl || upload.avatarUrl || uploadedFileId,
            coverFileId: uploadedFileId,
            theme: this.data.selectedTheme,
          },
        },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '创建失败')
      }

      wx.setStorageSync('selectedPetSpaceId', result.petSpace._id)
      this.setData({ saving: false })
      wx.showToast({ title: '创建成功', icon: 'success' })

      setTimeout(() => {
        wx.switchTab({
          url: '/pages/pet-detail/index',
        })
      }, 500)
    } catch (error) {
      this.setData({ saving: false })
      wx.showToast({
        title: error.message || '创建失败，请稍后重试',
        icon: 'none',
      })
    }
  },

  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },
})
