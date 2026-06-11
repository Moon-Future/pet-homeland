const template = require('../../pages/identity/templates/illustrated/config')

Component({
  properties: {
    pet: {
      type: Object,
      value: null,
    },
    templateId: {
      type: String,
      value: 'illustrated',
    },
  },

  data: {
    assets: template.assets,
  },

  methods: {
    previewAvatar() {
      this.triggerEvent('previewavatar')
    },
  },
})
