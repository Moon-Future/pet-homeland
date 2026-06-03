const defaultAvatar = '/assets/home/default-pet.png'
const auth = require('../../utils/auth')

Page({
  data: {
    saving: false,
    form: {
      nickname: '',
      avatarUrl: defaultAvatar,
      avatarFileId: '',
      avatarTempPath: '',
      avatarChanged: false,
    },
  },

  onLoad() {
    if (!auth.requireLogin({
      redirectToProfile: true,
    })) {
      return
    }

    this.fillForm(auth.getUserProfile())
    this.refreshUserProfile()
  },

  async refreshUserProfile() {
    if (!wx.cloud) {
      wx.showToast({ title: '请先开通云开发', icon: 'none' })
      return
    }

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'login',
        data: {},
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '登录失败')
      }

      const user = result.user || {}
      getApp().globalData.userProfile = user
      wx.setStorageSync('userProfile', user)
      this.fillForm(user)
    } catch (error) {
      wx.showToast({
        title: error.message || '登录失败，请稍后重试',
        icon: 'none',
      })
    }
  },

  fillForm(user = {}) {
    this.setData({
      form: {
        nickname: user.nickname || '',
        avatarUrl: user.avatarUrl || defaultAvatar,
        avatarFileId: user.avatarFileId || '',
        avatarTempPath: '',
        avatarChanged: false,
      },
    })
  },

  onNicknameInput(e) {
    this.setData({
      'form.nickname': e.detail.value,
    })
  },

  onChooseWechatAvatar(e) {
    const avatarUrl = e.detail && e.detail.avatarUrl
    if (!avatarUrl) {
      return
    }

    this.setData({
      'form.avatarUrl': avatarUrl,
      'form.avatarTempPath': avatarUrl,
      'form.avatarChanged': true,
    })
  },

  async uploadLocalAvatar() {
    try {
      const { tempFiles } = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
      })

      const file = tempFiles && tempFiles[0]
      if (!file || !file.tempFilePath) {
        return
      }

      this.setData({
        'form.avatarUrl': file.tempFilePath,
        'form.avatarTempPath': file.tempFilePath,
        'form.avatarChanged': true,
      })
    } catch (error) {
      wx.showToast({ title: '已取消上传头像', icon: 'none' })
    }
  },

  async saveProfile() {
    const nickname = this.data.form.nickname.trim()

    if (!nickname) {
      wx.showToast({ title: '请填写昵称', icon: 'none' })
      return
    }

    this.setData({ saving: true })

    try {
      const avatar = await this.ensureAvatarUploaded()
      const { result } = await wx.cloud.callFunction({
        name: 'login',
        data: {
          profile: {
            nickname,
            avatarUrl: avatar.avatarUrl,
            avatarFileId: avatar.avatarFileId,
          },
        },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '保存失败')
      }

      getApp().globalData.userProfile = result.user
      wx.setStorageSync('userProfile', result.user)
      this.setData({ saving: false })

      wx.showToast({ title: '已保存', icon: 'success' })

      setTimeout(() => {
        const pages = getCurrentPages()
        if (pages.length > 1) {
          wx.navigateBack()
          return
        }

        wx.switchTab({
          url: '/pages/profile/index',
        })
      }, 500)
    } catch (error) {
      this.setData({ saving: false })
      wx.showToast({
        title: error.message || '保存失败，请稍后重试',
        icon: 'none',
      })
    }
  },

  async ensureAvatarUploaded() {
    const { form } = this.data

    if (!form.avatarChanged || !form.avatarTempPath) {
      return {
        avatarUrl: form.avatarUrl,
        avatarFileId: form.avatarFileId,
      }
    }

    const ext = this.getFileExt(form.avatarTempPath)
    const cloudPath = `users/avatars/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const upload = await wx.cloud.uploadFile({
      cloudPath,
      filePath: form.avatarTempPath,
    })

    return {
      avatarUrl: upload.fileID,
      avatarFileId: upload.fileID,
    }
  },

  getFileExt(filePath) {
    const matched = /\.([a-z0-9]+)(?:\?|$)/i.exec(filePath)
    return matched ? matched[1].toLowerCase() : 'jpg'
  },

  isLocalFilePath(filePath) {
    return /^wxfile:|^http:\/\/tmp\//.test(filePath || '')
  },
})
