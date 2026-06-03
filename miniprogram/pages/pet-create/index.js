Page({
  data: {
    currentStep: 1,
    steps: [
      { id: 1, label: '上传照片' },
      { id: 2, label: '填写资料' },
      { id: 3, label: '选择主题' },
    ],
    form: {
      petName: '',
      lifeStatus: 'with_me',
    },
    themes: [
      {
        id: 'cloud',
        name: '云朵花园',
        image: '/assets/themes/cloud-garden.svg',
      },
      {
        id: 'rainbow',
        name: '彩虹桥',
        image: '/assets/themes/rainbow-bridge.svg',
      },
      {
        id: 'starry',
        name: '星河夜空',
        image: '/assets/themes/starry-night.svg',
      },
      {
        id: 'sakura',
        name: '樱花森林',
        image: '/assets/themes/sakura-forest.svg',
      },
    ],
    selectedTheme: 'rainbow',
    petPreview: '/assets/home/default-pet.png',
  },

  goStep(e) {
    const { step } = e.currentTarget.dataset
    this.setData({
      currentStep: Number(step),
    })
  },

  nextStep() {
    if (this.data.currentStep < 3) {
      this.setData({
        currentStep: this.data.currentStep + 1,
      })
      return
    }

    wx.showToast({
      title: '小窝创建流程开发中',
      icon: 'none',
    })
  },

  prevStep() {
    if (this.data.currentStep <= 1) {
      return
    }

    this.setData({
      currentStep: this.data.currentStep - 1,
    })
  },

  choosePhoto() {
    wx.showToast({
      title: '上传照片功能开发中',
      icon: 'none',
    })
  },

  selectTheme(e) {
    const { id } = e.currentTarget.dataset
    this.setData({
      selectedTheme: id,
    })
  },

  onNameInput(e) {
    this.setData({
      'form.petName': e.detail.value,
    })
  },

  setLifeStatus(e) {
    const { status } = e.currentTarget.dataset
    this.setData({
      'form.lifeStatus': status,
    })
  },
})
