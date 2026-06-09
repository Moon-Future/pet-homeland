const auth = require('../../utils/auth')

const storage = require('../../utils/storage')

Page({
  data: {
    pet: { name: '奶球', avatar: storage.defaultPetImage, date: '2018.05.03 - 2026.04.18' },
  },

  onLoad() {
    auth.requireLogin({
      redirectToProfile: true,
    })
  },

  startRead() {
    wx.showToast({ title: 'AI 回忆录开发中', icon: 'none' })
  },
})
