const auth = require('../../utils/auth')

const maxImages = 3
const memoryTypes = [
  { id: 'daily', label: '日常' },
  { id: 'growth', label: '成长' },
  { id: 'health', label: '健康' },
  { id: 'travel', label: '旅行' },
  { id: 'birthday', label: '生日' },
]

Page({
  data: {
    petSpaceId: '',
    saving: false,
    today: '',
    form: {
      title: '',
      content: '',
      memoryDate: '',
      type: 'daily',
    },
    memoryTypes,
    images: [],
    maxImages,
  },

  onLoad(options = {}) {
    if (!auth.requireLogin({ redirectToProfile: true })) {
      return
    }

    const today = this.formatDate(new Date())
    this.setData({
      petSpaceId: options.petSpaceId || wx.getStorageSync('selectedPetSpaceId') || '',
      today,
      'form.memoryDate': today,
    })
  },

  onTitleInput(e) {
    this.setData({ 'form.title': e.detail.value })
  },

  onContentInput(e) {
    this.setData({ 'form.content': e.detail.value })
  },

  onDateChange(e) {
    this.setData({ 'form.memoryDate': e.detail.value })
  },

  selectType(e) {
    this.setData({ 'form.type': e.currentTarget.dataset.type })
  },

  onMemoryImageChange(e) {
    const tempFilePath = e.detail && e.detail.tempFilePath

    if (!tempFilePath) {
      return
    }

    if (this.data.images.length >= maxImages) {
      wx.showToast({ title: '最多上传3张', icon: 'none' })
      return
    }

    const images = this.data.images.concat({
      tempFilePath,
      uploading: false,
    }).slice(0, maxImages)

    this.setData({ images })

    const uploader = this.selectComponent('#memoryImageUploader')
    if (uploader && uploader.resetPicker) {
      uploader.resetPicker()
    }
  },

  removeImage(e) {
    const index = Number(e.currentTarget.dataset.index)
    const images = this.data.images.filter((_, itemIndex) => itemIndex !== index)
    this.setData({ images })
  },

  validateForm() {
    const form = this.data.form

    if (!this.data.petSpaceId) {
      wx.showToast({ title: '缺少宠物小窝', icon: 'none' })
      return false
    }

    if (!form.content.trim() && !this.data.images.length) {
      wx.showToast({ title: '写点文字或上传照片吧', icon: 'none' })
      return false
    }

    if (this.data.images.length > maxImages) {
      wx.showToast({ title: '最多上传3张', icon: 'none' })
      return false
    }

    return true
  },

  async saveMemory() {
    if (this.data.saving || !this.validateForm()) {
      return
    }

    this.setData({ saving: true })

    try {
      const mediaFileIds = await this.uploadImages()
      const { result } = await wx.cloud.callFunction({
        name: 'addMemory',
        data: {
          petSpaceId: this.data.petSpaceId,
          memory: {
            title: this.data.form.title,
            content: this.data.form.content,
            memoryDate: this.data.form.memoryDate,
            type: this.data.form.type,
            mediaFileIds,
          },
        },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '保存失败')
      }

      wx.showToast({ title: '已记录', icon: 'success' })

      setTimeout(() => {
        wx.navigateBack()
      }, 500)
    } catch (error) {
      wx.showToast({
        title: error.message || '保存失败，请稍后重试',
        icon: 'none',
      })
    } finally {
      this.setData({ saving: false })
    }
  },

  async uploadImages() {
    const uploads = []

    for (let index = 0; index < this.data.images.length; index += 1) {
      const image = this.data.images[index]
      const cloudPath = `pet-spaces/memories/${this.data.petSpaceId}/${Date.now()}-${index}-${Math.random().toString(36).slice(2)}.jpg`
      const upload = await wx.cloud.uploadFile({
        cloudPath,
        filePath: image.tempFilePath,
      })

      uploads.push(upload.fileID)
    }

    return uploads
  },

  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },
})
