const storage = require('../../utils/storage')

const defaultImage = storage.assetUrl('images/user-default-avatar.jpg')
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
    imageType: {
      type: String,
      value: 'avatar',
    },
    cropRatio: {
      type: String,
      value: '',
    },
    petSpaceId: {
      type: String,
      value: '',
    },
    petUploadGrant: {
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

          let cropWidth = width
          let cropHeight = height

          if (!this.isFreeCropRatio()) {
            const ratio = this.getCropRatio()
            cropHeight = cropWidth / ratio

            if (cropHeight > height) {
              cropHeight = height
              cropWidth = cropHeight * ratio
            }
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

      const imageRect = this.data.imageRect
      const startBox = resizeStart.box
      const deltaX = touch.clientX - resizeStart.x
      const deltaY = touch.clientY - resizeStart.y

      if (this.isFreeCropRatio()) {
        const maxWidth = imageRect.left + imageRect.width - startBox.left
        const maxHeight = imageRect.top + imageRect.height - startBox.top
        const nextWidth = this.clamp(startBox.width + deltaX, Math.min(96, maxWidth), maxWidth)
        const nextHeight = this.clamp(startBox.height + deltaY, Math.min(96, maxHeight), maxHeight)

        this.setData({
          cropBox: {
            ...startBox,
            width: nextWidth,
            height: nextHeight,
          },
        })
        return
      }

      const ratio = this.getCropRatio()
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
      const ratio = this.isFreeCropRatio()
        ? cropBox.width / cropBox.height
        : this.getCropRatio()
      const outputWidth = this.getCropOutputWidth()
      const canvasWidth = this.isFreeCropRatio() && ratio < 1
        ? Math.round(outputWidth * ratio)
        : outputWidth
      const canvasHeight = this.isFreeCropRatio() && ratio < 1
        ? outputWidth
        : Math.round(canvasWidth / ratio)
      const sx = (cropBox.left - imageRect.left) / imageRect.width * imageInfo.width
      const sy = (cropBox.top - imageRect.top) / imageRect.height * imageInfo.height
      const sw = cropBox.width / imageRect.width * imageInfo.width
      const sh = cropBox.height / imageRect.height * imageInfo.height

      this.setData({
        canvasWidth,
        canvasHeight,
      }, () => {
        this.drawCropToCanvas({
          canvasWidth,
          canvasHeight,
          sx,
          sy,
          sw,
          sh,
        })
      })
    },

    drawCropToCanvas(options) {
      wx.createSelectorQuery()
        .in(this)
        .select('#cropCanvas')
        .fields({ node: true, size: true })
        .exec(async (res) => {
          const canvas = res && res[0] && res[0].node

          if (!canvas) {
            wx.showToast({ title: '裁剪失败，请重试', icon: 'none' })
            return
          }

          try {
            const { canvasWidth, canvasHeight, sx, sy, sw, sh } = options
            const ctx = canvas.getContext('2d')
            const image = await this.createCanvasImage(canvas, this.data.sourceImage)

            canvas.width = canvasWidth
            canvas.height = canvasHeight
            ctx.clearRect(0, 0, canvasWidth, canvasHeight)
            ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight)

            wx.canvasToTempFilePath({
              canvas,
              width: canvasWidth,
              height: canvasHeight,
              destWidth: canvasWidth,
              destHeight: canvasHeight,
              fileType: 'jpg',
              quality: 1,
              success: (result) => {
                this.setData({
                  displayUrl: result.tempFilePath,
                  croppedTempPath: result.tempFilePath,
                  changed: true,
                  cropVisible: false,
                  sourceImage: '',
                  imageInfo: null,
                  dragStart: null,
                  resizeStart: null,
                })

                this.triggerEvent('change', {
                  tempFilePath: result.tempFilePath,
                  changed: true,
                  cropRatio: this.getCropRatioText(),
                  imageType: this.properties.imageType,
                })
              },
              fail: () => {
                wx.showToast({ title: '裁剪失败，请重试', icon: 'none' })
              },
            })
          } catch (error) {
            wx.showToast({ title: '裁剪失败，请重试', icon: 'none' })
          }
        })
    },

    createCanvasImage(canvas, src) {
      return new Promise((resolve, reject) => {
        const image = canvas.createImage()
        image.onload = () => resolve(image)
        image.onerror = reject
        image.src = src
      })
    },

    async uploadCroppedImage() {
      if (!this.data.changed || !this.data.croppedTempPath) {
        return {
          ref: null,
          url: this.properties.value || defaultImage,
          changed: false,
        }
      }

      const upload = await storage.uploadImage({
        type: this.properties.imageType,
        petSpaceId: this.properties.petSpaceId,
        petUploadGrant: this.properties.petUploadGrant,
        filePath: this.data.croppedTempPath,
        ext: 'jpg',
      })

      this.setData({ changed: false })

      return {
        ref: upload.ref,
        url: upload.url,
        changed: true,
      }
    },

    resetPicker() {
      this.setData({
        displayUrl: this.properties.value || defaultImage,
        changed: false,
        croppedTempPath: '',
        sourceImage: '',
        imageInfo: null,
        dragStart: null,
        resizeStart: null,
        cropVisible: false,
      })
    },

    getCropRatioText() {
      return this.properties.cropRatio
        || cropRatiosByType[this.properties.imageType]
        || '1:1'
    },

    isFreeCropRatio() {
      return this.getCropRatioText() === 'free'
    },

    getCropRatio() {
      if (this.isFreeCropRatio()) {
        return 1
      }

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
