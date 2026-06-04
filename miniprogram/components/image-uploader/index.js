const { getImageUploadDir } = require('../../utils/image-dirs')
const auth = require('../../utils/auth')

const defaultImage = 'https://qiniu.cdn.cl8023.com/project/star-paws/images/user-default-avatar.png'
const cropRatiosByType = {
  avatar: '1:1',
  petCover: '16:9',
  petAlbum: '1:1',
  memory: '4:3',
}
const cropOutputWidthByType = {
  avatar: 1200,
  petCover: 1600,
  petAlbum: 1400,
  memory: 1400,
}

Component({
  properties: {
    value: {
      type: String,
      value: defaultImage,
      observer(value) {
        if (!this.data.changed) {
          this.setData({ displayUrl: value || defaultImage })
        }
      },
    },
    fileId: {
      type: String,
      value: '',
    },
    imageType: {
      type: String,
      value: 'avatar',
    },
    cropRatio: {
      type: String,
      value: '',
    },
    uploadDir: {
      type: String,
      value: '',
    },
    tip: {
      type: String,
      value: '点击头像选择微信头像',
    },
  },

  data: {
    displayUrl: defaultImage,
    changed: false,
    croppedTempPath: '',
    sourceImage: '',
    imageInfo: null,
    imageRect: { left: 0, top: 0, width: 0, height: 0 },
    cropBox: { left: 0, top: 0, width: 0, height: 0 },
    dragStart: null,
    resizeStart: null,
    cropVisible: false,
    canvasWidth: 1200,
    canvasHeight: 1200,
  },

  lifetimes: {
    attached() {
      this.setData({
        displayUrl: this.properties.value || defaultImage,
      })
    },
  },

  methods: {
    noop() {},

    onChooseWechatAvatar(e) {
      const avatarUrl = e.detail && e.detail.avatarUrl
      if (!avatarUrl) {
        return
      }

      this.openCropper(avatarUrl)
    },

    chooseLocalImage() {
      if (wx.chooseMedia) {
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          success: (res) => {
            const file = res.tempFiles && res.tempFiles[0]
            if (file && file.tempFilePath) {
              this.openCropper(file.tempFilePath)
            }
          },
        })
        return
      }

      wx.chooseImage({
        count: 1,
        sourceType: ['album', 'camera'],
        sizeType: ['original', 'compressed'],
        success: (res) => {
          const filePath = res.tempFilePaths && res.tempFilePaths[0]
          if (filePath) {
            this.openCropper(filePath)
          }
        },
      })
    },

    async openCropper(filePath) {
      try {
        const imageInfo = await this.getImageInfo(filePath)

        this.setData({
          cropVisible: true,
          sourceImage: filePath,
          imageInfo,
        })

        wx.nextTick(() => {
          this.initCropBox()
        })
      } catch (error) {
        wx.showToast({ title: '图片读取失败', icon: 'none' })
      }
    },

    initCropBox() {
      wx.createSelectorQuery()
        .in(this)
        .select('.crop-stage')
        .boundingClientRect((rect) => {
          if (!rect || !this.data.imageInfo) {
            return
          }

          const imageInfo = this.data.imageInfo
          const imageRatio = imageInfo.width / imageInfo.height
          const stageRatio = rect.width / rect.height
          let width = rect.width
          let height = rect.height
          let left = 0
          let top = 0

          if (imageRatio > stageRatio) {
            height = rect.width / imageRatio
            top = (rect.height - height) / 2
          } else {
            width = rect.height * imageRatio
            left = (rect.width - width) / 2
          }

          const ratio = this.getCropRatio()
          let cropWidth = width
          let cropHeight = cropWidth / ratio

          if (cropHeight > height) {
            cropHeight = height
            cropWidth = cropHeight * ratio
          }

          const imageRect = { left, top, width, height }
          const cropBox = {
            left: left + (width - cropWidth) / 2,
            top: top + (height - cropHeight) / 2,
            width: cropWidth,
            height: cropHeight,
          }

          this.setData({
            imageRect,
            cropBox,
          })
        })
        .exec()
    },

    onCropTouchStart(e) {
      const touch = e.touches && e.touches[0]
      if (!touch) {
        return
      }

      this.setData({
        dragStart: {
          x: touch.clientX,
          y: touch.clientY,
          box: { ...this.data.cropBox },
        },
      })
    },

    onCropTouchMove(e) {
      const touch = e.touches && e.touches[0]
      const dragStart = this.data.dragStart
      if (!touch || !dragStart) {
        return
      }

      const imageRect = this.data.imageRect
      const startBox = dragStart.box
      const nextLeft = startBox.left + touch.clientX - dragStart.x
      const nextTop = startBox.top + touch.clientY - dragStart.y
      const cropBox = {
        ...startBox,
        left: this.clamp(nextLeft, imageRect.left, imageRect.left + imageRect.width - startBox.width),
        top: this.clamp(nextTop, imageRect.top, imageRect.top + imageRect.height - startBox.height),
      }

      this.setData({ cropBox })
    },

    onResizeTouchStart(e) {
      const touch = e.touches && e.touches[0]
      if (!touch) {
        return
      }

      this.setData({
        resizeStart: {
          x: touch.clientX,
          y: touch.clientY,
          box: { ...this.data.cropBox },
        },
      })
    },

    onResizeTouchMove(e) {
      const touch = e.touches && e.touches[0]
      const resizeStart = this.data.resizeStart
      if (!touch || !resizeStart) {
        return
      }

      const ratio = this.getCropRatio()
      const imageRect = this.data.imageRect
      const startBox = resizeStart.box
      const deltaX = touch.clientX - resizeStart.x
      const deltaY = touch.clientY - resizeStart.y
      const widthFromX = startBox.width + deltaX
      const widthFromY = startBox.width + deltaY * ratio
      const preferredWidth = Math.max(widthFromX, widthFromY)
      const maxWidth = Math.min(
        imageRect.left + imageRect.width - startBox.left,
        (imageRect.top + imageRect.height - startBox.top) * ratio,
      )
      const minWidth = Math.min(96, maxWidth)
      const nextWidth = this.clamp(preferredWidth, minWidth, maxWidth)
      const nextHeight = nextWidth / ratio

      this.setData({
        cropBox: {
          ...startBox,
          width: nextWidth,
          height: nextHeight,
        },
      })
    },

    cancelCrop() {
      this.setData({
        cropVisible: false,
        sourceImage: '',
        imageInfo: null,
        dragStart: null,
        resizeStart: null,
      })
    },

    confirmCrop() {
      const imageInfo = this.data.imageInfo
      const imageRect = this.data.imageRect
      const cropBox = this.data.cropBox
      const ratio = this.getCropRatio()
      const canvasWidth = this.getCropOutputWidth()
      const canvasHeight = Math.round(canvasWidth / ratio)
      const sx = (cropBox.left - imageRect.left) / imageRect.width * imageInfo.width
      const sy = (cropBox.top - imageRect.top) / imageRect.height * imageInfo.height
      const sw = cropBox.width / imageRect.width * imageInfo.width
      const sh = cropBox.height / imageRect.height * imageInfo.height

      this.setData({
        canvasWidth,
        canvasHeight,
      }, () => {
        const ctx = wx.createCanvasContext('cropCanvas', this)
        ctx.clearRect(0, 0, canvasWidth, canvasHeight)
        ctx.drawImage(this.data.sourceImage, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight)
        ctx.draw(false, () => {
          wx.canvasToTempFilePath({
            canvasId: 'cropCanvas',
            width: canvasWidth,
            height: canvasHeight,
            destWidth: canvasWidth,
            destHeight: canvasHeight,
            fileType: 'jpg',
            quality: 1,
            success: (res) => {
              this.setData({
                displayUrl: res.tempFilePath,
                croppedTempPath: res.tempFilePath,
                changed: true,
                cropVisible: false,
                sourceImage: '',
                imageInfo: null,
                dragStart: null,
                resizeStart: null,
              })

              this.triggerEvent('change', {
                tempFilePath: res.tempFilePath,
                changed: true,
                cropRatio: this.getCropRatioText(),
                imageType: this.properties.imageType,
              })
            },
            fail: () => {
              wx.showToast({ title: '裁剪失败，请重试', icon: 'none' })
            },
          }, this)
        })
      })
    },

    async uploadCroppedImage() {
      if (!this.data.changed || !this.data.croppedTempPath) {
        return {
          avatarUrl: this.properties.value || defaultImage,
          avatarFileId: this.properties.fileId || '',
        }
      }

      const oldFileId = this.properties.fileId || ''
      const upload = await this.uploadWithOverwrite(oldFileId)

      await this.deleteOldFile(oldFileId, upload.fileID)

      this.setData({
        changed: false,
      })

      return {
        avatarUrl: upload.fileID,
        avatarFileId: upload.fileID,
        fileId: upload.fileID,
      }
    },

    async uploadWithOverwrite(oldFileId) {
      const cloudPath = this.getCloudPath()
      const filePath = this.data.croppedTempPath

      try {
        return await wx.cloud.uploadFile({
          cloudPath,
          filePath,
        })
      } catch (error) {
        if (!this.isFileExistsError(error) || !oldFileId) {
          throw error
        }

        await this.deleteOldFile(oldFileId, '')
        return wx.cloud.uploadFile({
          cloudPath,
          filePath,
        })
      }
    },

    getCloudPath() {
      const uploadDir = this.properties.uploadDir || getImageUploadDir(this.properties.imageType)

      if (this.properties.imageType === 'avatar') {
        const user = auth.getUserProfile()
        if (user && user.openid) {
          return `${uploadDir}/${user.openid}-${Date.now()}.jpg`
        }
      }

      return `${uploadDir}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
    },

    async deleteOldFile(oldFileId, newFileId) {
      if (!oldFileId || oldFileId === newFileId || !oldFileId.startsWith('cloud://')) {
        return
      }

      try {
        await wx.cloud.deleteFile({
          fileList: [oldFileId],
        })
      } catch (error) {
        // Deleting stale files is best-effort; saving the new avatar should not fail because of it.
      }
    },

    isFileExistsError(error = {}) {
      const message = `${error.errCode || ''} ${error.errMsg || ''} ${error.message || ''}`
      return message.includes('already exist') || message.includes('file exists')
    },

    getCropRatioText() {
      return this.properties.cropRatio
        || cropRatiosByType[this.properties.imageType]
        || '1:1'
    },

    getCropRatio() {
      const ratioText = this.getCropRatioText()
      const [width, height] = String(ratioText)
        .split(':')
        .map((item) => Number(item))

      if (!width || !height) {
        return 1
      }

      return width / height
    },

    getCropOutputWidth() {
      return cropOutputWidthByType[this.properties.imageType] || 1200
    },

    getImageInfo(src) {
      return new Promise((resolve, reject) => {
        wx.getImageInfo({
          src,
          success: resolve,
          fail: reject,
        })
      })
    },

    clamp(value, min, max) {
      if (value < min) {
        return min
      }

      if (value > max) {
        return max
      }

      return value
    },
  },
})
