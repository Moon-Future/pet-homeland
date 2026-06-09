const auth = require('../../utils/auth')
const storage = require('../../utils/storage')

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
    memoryId: '',
    isEditing: false,
    saving: false,
    deleting: false,
    today: '',
    entryMode: 'daily',
    pageTitle: '记录今天',
    form: {
      title: '',
      content: '',
      memoryDate: '',
      type: 'daily',
    },
    memoryTypes,
    images: [],
    originalMediaKeys: [],
    maxImages,
    quota: {
      limit: 30,
      used: 0,
      remaining: 30,
      displayRemaining: 30,
      loading: false,
    },
    petUploadGrant: '',
    pendingUploadedRefs: [],
  },

  noop() {},

  onLoad(options = {}) {
    if (!auth.requireLogin({ redirectToProfile: true })) {
      return
    }

    const today = this.formatDate(new Date())
    const entryMode = options.entryMode === 'memorial' ? 'memorial' : 'daily'
    const pageTitle = options.memoryId ? '编辑日常' : (entryMode === 'memorial' ? '记录回忆' : '记录今天')
    this.setData({
      petSpaceId: options.petSpaceId || wx.getStorageSync('selectedPetSpaceId') || '',
      memoryId: options.memoryId || '',
      isEditing: Boolean(options.memoryId),
      today,
      entryMode,
      pageTitle,
      'form.memoryDate': today,
    })

    wx.setNavigationBarTitle({
      title: pageTitle,
    })

    if (options.memoryId) {
      this.loadMemory(options.memoryId)
    } else {
      this.loadImageQuota()
    }

    this.loadPetUploadGrant()
  },

  onUnload() {
    this.cleanupPendingUploads().catch(() => {})
  },

  async loadMemory(memoryId) {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getMemories',
        data: {
          memoryId,
          limit: 1,
        },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '读取记录失败')
      }

      const memory = (result.memories || [])[0]
      if (!memory) {
        throw new Error('记录不存在')
      }

      const mediaRefs = memory.mediaRefs || []
      const mediaUrls = memory.mediaUrls || []

      this.setData({
        petSpaceId: memory.petSpaceId || this.data.petSpaceId,
        form: {
          title: memory.title || '',
          content: memory.content || '',
          memoryDate: memory.memoryDate || this.data.today,
          type: memory.type || 'daily',
        },
        images: mediaRefs.map((ref, index) => ({
          tempFilePath: mediaUrls[index] || storage.buildUrl(ref),
          ref,
          uploaded: true,
        })),
        originalMediaKeys: mediaRefs.map((ref) => ref.key).filter(Boolean),
      })
      this.loadImageQuota()
      this.loadPetUploadGrant()
    } catch (error) {
      wx.showToast({
        title: error.message || '读取记录失败',
        icon: 'none',
      })
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

    if (this.data.quota.displayRemaining <= 0) {
      wx.showToast({ title: `最多可上传${this.data.quota.limit}张回忆图片`, icon: 'none' })
      return
    }

    const images = this.data.images.concat({
      tempFilePath,
      ref: null,
      uploaded: false,
    }).slice(0, maxImages)

    this.setData({ images })
    this.updateQuotaDisplay()

    const uploader = this.selectComponent('#memoryImageUploader')
    if (uploader && uploader.resetPicker) {
      uploader.resetPicker()
    }
  },

  removeImage(e) {
    const index = Number(e.currentTarget.dataset.index)
    const images = this.data.images.filter((_, itemIndex) => itemIndex !== index)
    this.setData({ images })
    this.updateQuotaDisplay()
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
      await this.checkImageQuota()
      const mediaRefs = await this.uploadImages()
      const payload = {
        petSpaceId: this.data.petSpaceId,
        memory: {
          title: this.data.form.title,
          content: this.data.form.content,
          memoryDate: this.data.form.memoryDate,
          type: this.data.form.type,
          mediaRefs,
        },
      }
      const { result } = await wx.cloud.callFunction(this.data.isEditing ? {
        name: 'updateMemory',
        data: {
          memoryId: this.data.memoryId,
          memory: payload.memory,
        },
      } : {
        name: 'addMemory',
        data: payload,
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '保存失败')
      }

      this.setData({ pendingUploadedRefs: [] })
      wx.showToast({ title: this.data.isEditing ? '已保存' : '已记录', icon: 'success' })
      this.markMemoryListDirty()

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

  async uploadImages() {
    const refs = []

    for (let index = 0; index < this.data.images.length; index += 1) {
      const image = this.data.images[index]

      if (image.ref && image.ref.key) {
        refs.push(image.ref)
        continue
      }

      const upload = await storage.uploadImage({
        type: 'memory',
        petSpaceId: this.data.petSpaceId,
        petUploadGrant: this.data.petUploadGrant,
        filePath: image.tempFilePath,
        ext: 'jpg',
      })
      refs.push(upload.ref)
      this.addPendingRef(upload.ref)
    }

    return refs
  },

  async checkImageQuota() {
    const { result } = await wx.cloud.callFunction({
      name: 'getMediaQuota',
      data: {
        excludeKeys: this.data.isEditing ? this.data.originalMediaKeys : [],
        nextImageCount: this.data.images.length,
      },
    })

    if (!result || !result.ok) {
      throw new Error((result && result.message) || '图片额度不足')
    }
  },

  async loadImageQuota() {
    this.setData({ 'quota.loading': true })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getMediaQuota',
        data: {
          excludeKeys: this.data.isEditing ? this.data.originalMediaKeys : [],
          nextImageCount: this.data.images.length,
        },
      })

      if (!result) {
        throw new Error('读取图片额度失败')
      }

      const quota = {
        limit: result.limit || 30,
        used: result.used || 0,
        remaining: result.remaining || 0,
        displayRemaining: Math.max((result.remaining || 0) - this.getNewLocalImageCount(), 0),
        loading: false,
      }

      this.setData({ quota })
    } catch (error) {
      this.setData({ 'quota.loading': false })
    }
  },

  updateQuotaDisplay() {
    const quota = this.data.quota || {}
    const remaining = Number(quota.remaining || 0)
    this.setData({
      'quota.displayRemaining': Math.max(remaining - this.getNewLocalImageCount(), 0),
    })
  },

  getNewLocalImageCount() {
    return this.data.images.filter((image) => !image.ref || !image.ref.key).length
  },

  deleteMemory() {
    if (!this.data.memoryId || this.data.deleting) {
      return
    }

    wx.showModal({
      title: '删除这条日常？',
      content: '删除后不会再显示在时间轴和相册里。',
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        this.setData({ deleting: true })

        try {
          const { result } = await wx.cloud.callFunction({
            name: 'updateMemory',
            data: {
              memoryId: this.data.memoryId,
              action: 'delete',
            },
          })

          if (!result || !result.ok) {
            throw new Error((result && result.message) || '删除失败')
          }

          wx.showToast({ title: '已删除', icon: 'success' })
          this.markMemoryListDirty()
          setTimeout(() => {
            wx.navigateBack()
          }, 500)
        } catch (error) {
          this.setData({ deleting: false })
          wx.showToast({
            title: error.message || '删除失败',
            icon: 'none',
          })
        }
      },
    })
  },

  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  markMemoryListDirty() {
    wx.setStorageSync('memoryListDirty', Date.now())
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
