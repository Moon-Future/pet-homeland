const defaultPetImage = '/assets/home/default-pet.png'
const themeBackgrounds = {
  cloud: 'https://qiniu.cdn.cl8023.com/project/star-pet-village/assets/themes/cloud-garden.png',
  rainbow: 'https://qiniu.cdn.cl8023.com/project/star-pet-village/assets/themes/sunset-flowers.png',
  starry: 'https://qiniu.cdn.cl8023.com/project/star-pet-village/assets/themes/starry-sky.png',
  sakura: 'https://qiniu.cdn.cl8023.com/project/star-pet-village/assets/themes/sakura-avenue.png',
}

Page({
  data: {
    loading: true,
    error: '',
    pet: null,
  },

  onLoad(options = {}) {
    this.resolveIdentity(options)
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

    this.setData({ loading: true, error: '', pet: null })

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

      this.setData({
        loading: false,
        pet: this.normalizePet(result.petSpace),
      })
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

    return {
      id: item._id,
      identityNo: item.identityNo || '未生成',
      identityStatusText: item.identityStatus === 'archived' ? '已归档' : '永久保留',
      nfcStatusText: nfc.status === 'bound' ? '已绑定' : '未绑定',
      petName: item.petName || '未命名宠物',
      phaseText: isInStars ? '数字纪念档案' : '数字生命档案',
      birthDate: item.birthDate || '',
      arrivalDate: item.arrivalDate || '',
      deathDate: item.deathDate || '',
      avatar: item.avatarUrl || item.coverUrl || defaultPetImage,
      cover: themeBackgrounds[item.theme] || item.coverUrl || item.avatarUrl || defaultPetImage,
      story: item.story || '',
    }
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

  goHome() {
    wx.switchTab({
      url: '/pages/index/index',
    })
  },
})
