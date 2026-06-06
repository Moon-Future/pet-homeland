const auth = require('../../utils/auth')

const feedbackTypes = [
  { id: 'feature', label: '功能建议' },
  { id: 'bug', label: '使用问题' },
  { id: 'data', label: '数据异常' },
  { id: 'other', label: '其他' },
]

Page({
  data: {
    feedbackTypes,
    form: {
      type: 'feature',
      content: '',
      contact: '',
    },
    submitting: false,
  },

  onLoad() {
    auth.requireLogin({ redirectToProfile: true })
  },

  selectType(e) {
    this.setData({ 'form.type': e.currentTarget.dataset.type })
  },

  onContentInput(e) {
    this.setData({ 'form.content': e.detail.value })
  },

  onContactInput(e) {
    this.setData({ 'form.contact': e.detail.value })
  },

  validateForm() {
    if (!this.data.form.content.trim()) {
      wx.showToast({ title: '请写下反馈内容', icon: 'none' })
      return false
    }

    return true
  },

  async submitFeedback() {
    if (this.data.submitting || !this.validateForm()) {
      return
    }

    this.setData({ submitting: true })

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'submitFeedback',
        data: {
          feedback: this.data.form,
        },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '提交失败')
      }

      wx.showToast({ title: '已收到反馈', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 600)
    } catch (error) {
      wx.showToast({
        title: error.message || '提交失败，请稍后重试',
        icon: 'none',
      })
    } finally {
      this.setData({ submitting: false })
    }
  },
})
