const defaultAvatar = 'https://qiniu.cdn.cl8023.com/project/star-paws/images/user-default-avatar.png'
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

  onAvatarChange(e) {
    this.setData({
      'form.avatarUrl': e.detail.tempFilePath,
      'form.avatarTempPath': e.detail.tempFilePath,
      'form.avatarChanged': true,
    })
  },

  async saveProfile() {
    const nickname = this.data.form.nickname.trim()

    if (!nickname) {
      wx.showToast({ title: '请填写昵称', icon: 'none' })
      return
    }

    this.setData({ saving: true })

    try {
      const avatarUploader = this.selectComponent('#avatarUploader')
      const avatar = avatarUploader
        ? await avatarUploader.uploadCroppedImage()
        : {
            avatarUrl: this.data.form.avatarUrl,
            avatarFileId: this.data.form.avatarFileId,
          }
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
})
