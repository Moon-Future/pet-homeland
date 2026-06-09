const storage = require('../../utils/storage')
const auth = require('../../utils/auth')

const defaultAvatar = storage.assetUrl('images/user-default-avatar.jpg')

Page({
  data: {
    saving: false,
    pendingUploadedRefs: [],
    form: {
      nickname: '',
      avatarUrl: defaultAvatar,
      avatarRef: null,
      avatarTempPath: '',
      avatarChanged: false,
    },
  },

  noop() {},

  onLoad() {
    if (!auth.requireLogin({
      redirectToProfile: true,
    })) {
      return
    }

    this.fillForm(auth.getUserProfile())
    this.refreshUserProfile()
  },

  onUnload() {
    this.cleanupPendingUploads().catch(() => {})
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

      const user = {
        ...(result.user || {}),
        sessionGrant: result.sessionGrant || '',
      }
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
        avatarRef: user.avatarRef || null,
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
        : { ref: this.data.form.avatarRef, url: this.data.form.avatarUrl, changed: false }

      const payload = { nickname }
      if (avatar.changed) {
        this.addPendingRef(avatar.ref)
        payload.avatarRef = avatar.ref
      }

      const { result } = await wx.cloud.callFunction({
        name: 'login',
        data: { profile: payload },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '保存失败')
      }

      const user = {
        ...(result.user || {}),
        sessionGrant: result.sessionGrant || '',
      }
      getApp().globalData.userProfile = user
      wx.setStorageSync('userProfile', user)
      this.fillForm(user)
      this.setData({ pendingUploadedRefs: [] })
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
      await this.cleanupPendingUploads().catch(() => {})
      this.setData({ saving: false })
      wx.showToast({
        title: error.message || '保存失败，请稍后重试',
        icon: 'none',
      })
    }
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
