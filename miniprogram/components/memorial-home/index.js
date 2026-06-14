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
    interactionSyncing: {
      type: Boolean,
      value: false,
    },
    syncingInteractionType: {
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
  },

  observers: {
    'rawPet.theme, albumPreviewImages, recentMemories': function observeMemorialData() {
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
      const albumItems = images.slice(0, 4)
      while (albumItems.length < 4) {
        albumItems.push(fallback)
      }

      this.setData({
        albumItems,
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

    onGoMemoryDetail(e) {
      this.triggerEvent('memorydetail', {
        id: e.currentTarget.dataset.id,
      })
    },
  },
})
