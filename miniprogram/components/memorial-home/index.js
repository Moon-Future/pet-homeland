const storage = require('../../utils/storage')

const defaultLayout = {
  heroHeight: 1080,
  aspectRatio: 853 / 1844,
  avatar: { left: 31, top: 9, width: 38 },
  info: { top: 43 },
  contentOffset: 74,
}

Component({
  properties: {
    pet: {
      type: Object,
      value: null,
    },
    rawPet: {
      type: Object,
      value: null,
    },
    isOwner: {
      type: Boolean,
      value: false,
    },
    canSharePet: {
      type: Boolean,
      value: false,
    },
    customTopbarStyle: {
      type: String,
      value: '',
    },
    reviewNotice: {
      type: Object,
      value: null,
    },
    recentMemories: {
      type: Array,
      value: [],
    },
    timelineNodes: {
      type: Array,
      value: [],
    },
    albumPreviewImages: {
      type: Array,
      value: [],
    },
    actions: {
      type: Array,
      value: [],
    },
    interactionSyncing: {
      type: Boolean,
      value: false,
    },
    syncingInteractionType: {
      type: String,
      value: '',
    },
    interactionPulseType: {
      type: String,
      value: '',
    },
  },

  data: {
    theme: null,
    heroStyle: '',
    avatarStyle: '',
    infoStyle: '',
    contentStyle: '',
    toneClass: '',
    albumItems: [],
    floatingActions: [],
    memorialDates: null,
    showMemorialBook: false,
  },

  observers: {
    'rawPet.theme, pet.birthDate, pet.deathDate, albumPreviewImages, recentMemories, actions': function observeMemorialData() {
      this.applyTheme()
      this.applyDerivedContent()
    },
  },

  lifetimes: {
    attached() {
      this.applyTheme()
      this.applyDerivedContent()
    },
  },

  methods: {
    applyTheme() {
      const rawPet = this.data.rawPet || {}
      const theme = storage.getMemorialHomeTheme(rawPet.theme)
      const layout = (theme && theme.layout) || defaultLayout
      const avatar = layout.avatar || defaultLayout.avatar
      const info = layout.info || defaultLayout.info
      const aspectRatio = Number(layout.aspectRatio || defaultLayout.aspectRatio)
      const avatarHeight = avatar.height || Number((avatar.width * aspectRatio).toFixed(2))

      this.setData({
        theme,
        toneClass: layout.tone === 'dark' ? 'tone-dark' : 'tone-light',
        heroStyle: `height: ${layout.heroHeight || defaultLayout.heroHeight}rpx;`,
        avatarStyle: [
          `left: ${avatar.left}%;`,
          `top: ${avatar.top}%;`,
          `width: ${avatar.width}%;`,
          `height: ${avatarHeight}%;`,
        ].join(' '),
        infoStyle: `top: ${info.top}%;`,
        contentStyle: `margin-top: -${layout.contentOffset || defaultLayout.contentOffset}rpx;`,
      })
    },

    applyDerivedContent() {
      const images = this.data.albumPreviewImages || []
      const fallback = (this.data.pet && this.data.pet.avatar) || storage.defaultPetImage
      const albumItems = images
        .filter((item) => item && !this.isDefaultPetImage(item))
        .slice(0, 4)
        .map((url) => ({ url, placeholder: false }))
      if (!albumItems.length) {
        albumItems.push({ url: fallback, placeholder: true })
      }

      this.setData({
        albumItems,
        floatingActions: this.buildFloatingActions(),
        memorialDates: this.buildMemorialDates(),
      })
    },

    isDefaultPetImage(url = '') {
      return url === storage.defaultPetImage || String(url).includes('/images/default-pet')
    },

    buildMemorialDates() {
      const pet = this.data.pet || {}
      const birthDate = pet.birthDate || ''
      const deathDate = pet.deathDate || ''
      const ageText = birthDate && deathDate ? this.getAgeAtDateText(birthDate, deathDate) : ''

      return {
        birthText: birthDate || '*',
        deathText: deathDate || '*',
        ageText,
      }
    },

    getAgeAtDateText(birthDate, endDate) {
      const birth = new Date(birthDate)
      const end = new Date(endDate)

      if (Number.isNaN(birth.getTime()) || Number.isNaN(end.getTime()) || end < birth) {
        return ''
      }

      let years = end.getFullYear() - birth.getFullYear()
      let months = end.getMonth() - birth.getMonth()
      if (end.getDate() < birth.getDate()) {
        months -= 1
      }
      if (months < 0) {
        years -= 1
        months += 12
      }

      if (years > 0) {
        return months > 0 ? `${years}岁${months}个月` : `${years}岁`
      }

      return `${months || 1}个月`
    },

    buildFloatingActions() {
      const actionMap = (this.data.actions || []).reduce((map, item) => {
        if (item && item.type) {
          map[item.type] = item
        }
        return map
      }, {})
      const stats = (this.data.rawPet && this.data.rawPet.stats) || {}
      const fallbackCountByType = {
        miss: stats.missCount || 0,
        flower: stats.flowerCount || 0,
        star: stats.starCount || 0,
      }

      return [
        { type: 'miss', label: '点亮', icon: '/assets/icons/sparkle.svg' },
        { type: 'flower', label: '献花', icon: '/assets/icons/flower.svg' },
        { type: 'star', label: '祈福', icon: '/assets/icons/star.svg' },
      ].map((item) => {
        const action = actionMap[item.type] || {}
        const total = action.totalCountText || String(fallbackCountByType[item.type] || 0)
        return {
          ...item,
          totalCountText: total,
        }
      })
    },

    onBack() {
      this.triggerEvent('back')
    },

    onEdit() {
      this.triggerEvent('edit')
    },

    onInteract(e) {
      this.triggerEvent('interact', {
        type: e.currentTarget.dataset.type,
      })
    },

    onGoTimeline() {
      this.triggerEvent('timeline')
    },

    onGoAlbum() {
      this.triggerEvent('album')
    },

    onGoMoments() {
      this.triggerEvent('moments')
    },

    onAddMemory() {
      this.triggerEvent('addmemory')
    },

    onIdentity() {
      this.triggerEvent('identity')
    },

    onClaimIdentity() {
      this.triggerEvent('claimidentity')
    },

    onUnpublish() {
      this.triggerEvent('unpublish')
    },

    openMemorialBook() {
      this.setData({ showMemorialBook: true })
    },

    closeMemorialBook() {
      this.setData({ showMemorialBook: false })
    },

    noop() {},

    onTabNav(e) {
      this.triggerEvent('tabnav', {
        url: e.currentTarget.dataset.url,
      })
    },

    onGoMemoryDetail(e) {
      this.triggerEvent('memorydetail', {
        id: e.currentTarget.dataset.id,
      })
    },
  },
})
