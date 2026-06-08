const auth = require('../../utils/auth')

const defaultPetImage = '/assets/home/default-pet.png'
const typeLabels = {
  daily: '日常',
  growth: '成长',
  health: '健康',
  travel: '旅行',
  birthday: '生日',
}
const petTypeLabels = {
  cat: '猫咪',
  dog: '狗狗',
  rabbit: '兔子',
  hamster: '仓鼠',
  bird: '小鸟',
  other: '其他',
}
const lifeStatusLabels = {
  with_me: '陪伴中',
  in_stars: '已去星星',
}
const reviewStatusLabels = {
  not_required: '无需审核',
  pending_review: '待审核',
  approved: '已通过',
  rejected: '未通过',
  hidden: '已隐藏',
}

Page({
  data: {
    loading: false,
    type: '',
    id: '',
    index: 0,
    queue: [],
    current: null,
    target: null,
    report: null,
    error: '',
  },

  onLoad(options = {}) {
    if (!auth.requireLogin({ redirectToProfile: true })) {
      return
    }

    const stored = wx.getStorageSync('adminReviewQueue') || {}
    const type = options.type || stored.type || 'pet_space'
    const queue = stored.type === type ? (stored.items || []) : []
    const index = this.resolveIndex(queue, options.id, Number(options.index) || 0)
    const current = queue[index] || null
    const id = options.id || (current && current._id) || ''

    this.setData({ type, id, index, queue, current })
    this.loadDetail()
  },

  resolveIndex(queue, id, fallback) {
    if (id) {
      const index = queue.findIndex((item) => item._id === id)
      if (index >= 0) {
        return index
      }
    }

    return Math.min(Math.max(fallback, 0), Math.max(queue.length - 1, 0))
  },

  async loadDetail() {
    if (!this.data.id || this.data.loading) {
      return
    }

    this.setData({ loading: true, error: '', target: null, report: null })

    try {
      if (this.data.type === 'memory') {
        await this.loadMemory(this.data.id)
      } else if (this.data.type === 'report') {
        await this.loadReport(this.data.id)
      } else if (this.data.type === 'hidden') {
        await this.loadHidden(this.data.id)
      } else {
        await this.loadPetSpace(this.data.id)
      }
      this.setData({ loading: false })
    } catch (error) {
      this.setData({
        loading: false,
        error: error.message || '读取审核详情失败',
      })
    }
  },

  async loadPetSpace(id) {
    const { result } = await wx.cloud.callFunction({
      name: 'getPetSpaceDetail',
      data: { petSpaceId: id, source: 'admin_review' },
    })

    if (!result || !result.ok) {
      throw new Error((result && result.message) || '读取小窝失败')
    }

    this.setData({ target: this.normalizePetSpace(result.petSpace || {}) })
  },

  async loadMemory(id) {
    const { result } = await wx.cloud.callFunction({
      name: 'getMemories',
      data: { memoryId: id, source: 'admin_review', limit: 1 },
    })

    if (!result || !result.ok) {
      throw new Error((result && result.message) || '读取回忆失败')
    }

    const memory = (result.memories || [])[0]
    if (!memory) {
      throw new Error('这条回忆不存在')
    }

    this.setData({ target: this.normalizeMemory(memory) })
  },

  async loadReport(id) {
    const report = (this.data.queue || []).find((item) => item._id === id) || this.data.current
    if (!report) {
      throw new Error('这条举报不存在')
    }

    this.setData({ report: this.normalizeReport(report) })

    if (report.targetType === 'memory') {
      await this.loadMemory(report.targetId)
    } else {
      await this.loadPetSpace(report.targetId)
    }
  },

  async loadHidden(id) {
    const item = (this.data.queue || []).find((queueItem) => queueItem._id === id) || this.data.current
    if (!item) {
      throw new Error('这条隐藏内容不存在')
    }

    if (item.targetType === 'memory') {
      await this.loadMemory(item.targetId)
    } else {
      await this.loadPetSpace(item.targetId)
    }
  },

  normalizePetSpace(item = {}) {
    return {
      kind: 'pet_space',
      id: item._id,
      title: item.petName || '未命名小窝',
      image: item.coverUrl || item.avatarUrl || defaultPetImage,
      reviewStatus: item.reviewStatus || 'approved',
      reviewStatusText: reviewStatusLabels[item.reviewStatus || 'approved'] || '未知',
      fields: [
        { label: '宠物名字', value: item.petName || '未填写' },
        { label: '宠物类型', value: petTypeLabels[item.petType] || item.petType || '其他' },
        { label: '宠物品种', value: item.breed || '未填写' },
        { label: '生命状态', value: lifeStatusLabels[item.lifeStatus] || item.lifeStatus || '未填写' },
        { label: '出生日期', value: item.birthDate || '未填写' },
        { label: '来到身边', value: item.arrivalDate || '未填写' },
        { label: '离开日期', value: item.deathDate || '未填写' },
        { label: '公开状态', value: item.visibility || 'private' },
      ],
      contentTitle: '一句话介绍/故事',
      content: item.story || '未填写',
      mediaUrls: [item.coverUrl || item.avatarUrl].filter(Boolean),
      hiddenReason: item.hiddenReason || '',
    }
  },

  normalizeMemory(item = {}) {
    return {
      kind: 'memory',
      id: item._id,
      title: item.title || '今天的记录',
      image: (item.mediaUrls || [])[0] || defaultPetImage,
      reviewStatus: item.reviewStatus || 'not_required',
      reviewStatusText: reviewStatusLabels[item.reviewStatus || 'not_required'] || '未知',
      fields: [
        { label: '标题', value: item.title || '未填写' },
        { label: '日期', value: item.memoryDate || '未填写' },
        { label: '类型', value: typeLabels[item.type] || item.type || '日常' },
        { label: '所属小窝', value: item.petSpaceId || '未知' },
      ],
      contentTitle: '正文内容',
      content: item.content || '未填写正文',
      mediaUrls: item.mediaUrls || [],
      hiddenReason: item.hiddenReason || '',
    }
  },

  normalizeReport(item = {}) {
    return {
      id: item._id,
      targetType: item.targetType || 'pet_space',
      targetId: item.targetId || '',
      reason: item.reason || '未填写原因',
      detail: item.detail || '用户没有补充说明',
      reporterOpenid: item.reporterOpenid || '',
      status: item.status || 'open',
      createdAt: item.createdAt || '',
    }
  },

  goBack() {
    wx.navigateBack()
  },

  prevItem() {
    this.switchItem(this.data.index - 1)
  },

  nextItem() {
    this.switchItem(this.data.index + 1)
  },

  switchItem(index) {
    const queue = this.data.queue || []
    if (index < 0 || index >= queue.length) {
      return
    }

    const current = queue[index]
    this.setData({
      index,
      current,
      id: current._id,
    })
    wx.setStorageSync('adminReviewQueue', {
      type: this.data.type,
      index,
      items: queue,
    })
    this.loadDetail()
  },

  approve() {
    this.review('approve')
  },

  reject() {
    this.review('reject')
  },

  review(action) {
    const target = this.getActionTarget()
    if (!target) {
      return
    }

    const title = action === 'approve' ? '通过审核' : '拒绝内容'
    const content = action === 'approve' ? '通过后内容可以公开展示。' : '拒绝后内容不会公开展示。'
    this.confirmAction(title, content, async () => {
      const { result } = await wx.cloud.callFunction({
        name: 'reviewContent',
        data: {
          targetType: target.type,
          targetId: target.id,
          action,
          reason: action === 'reject' ? '内容未通过人工审核' : '',
        },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '处理失败')
      }
    })
  },

  hide() {
    this.handleVisibility('hide')
  },

  restore() {
    this.handleVisibility('restore')
  },

  handleVisibility(action) {
    const target = this.getActionTarget()
    if (!target) {
      return
    }

    const title = action === 'restore' ? '恢复内容' : '隐藏内容'
    const content = action === 'restore' ? '恢复后会回到隐藏前的审核状态。' : '隐藏后内容不会继续公开展示。'
    this.confirmAction(title, content, async () => {
      const { result } = await wx.cloud.callFunction({
        name: 'hidePublicContent',
        data: {
          targetType: target.type,
          targetId: target.id,
          action,
          reason: '内容已被管理员隐藏',
        },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '处理失败')
      }
    })
  },

  resolveReport() {
    const report = this.data.report
    if (!report || !report.id) {
      return
    }

    this.confirmAction('处理举报', '确认这条举报已经处理完成。', async () => {
      const { result } = await wx.cloud.callFunction({
        name: 'resolveReport',
        data: {
          reportId: report.id,
          resolution: '管理员已处理',
        },
      })

      if (!result || !result.ok) {
        throw new Error((result && result.message) || '处理失败')
      }
    })
  },

  getActionTarget() {
    if (this.data.type === 'report') {
      const report = this.data.report || {}
      if (!report.targetId) {
        return null
      }
      return {
        type: report.targetType === 'memory' ? 'memory' : 'pet_space',
        id: report.targetId,
      }
    }

    if (this.data.type === 'hidden') {
      const item = this.data.current || {}
      if (!item.targetId) {
        return null
      }
      return {
        type: item.targetType === 'memory' ? 'memory' : 'pet_space',
        id: item.targetId,
      }
    }

    return {
      type: this.data.type === 'memory' ? 'memory' : 'pet_space',
      id: this.data.id,
    }
  },

  confirmAction(title, content, onConfirm) {
    wx.showModal({
      title,
      content,
      confirmColor: '#8b5cf6',
      success: async (res) => {
        if (!res.confirm) {
          return
        }

        try {
          await onConfirm()
          this.markReviewDirty()
          wx.showToast({ title: '已处理', icon: 'success' })
          this.loadDetail()
        } catch (error) {
          wx.showToast({ title: error.message || '处理失败', icon: 'none' })
        }
      },
    })
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url
    const target = this.data.target || {}
    if (!url || !target.mediaUrls || !target.mediaUrls.length) {
      return
    }

    wx.previewImage({
      current: url,
      urls: target.mediaUrls,
    })
  },

  markReviewDirty() {
    wx.setStorageSync('adminReviewDirty', Date.now())
  },
})
