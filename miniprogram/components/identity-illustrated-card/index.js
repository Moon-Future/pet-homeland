const template = require('../../pages/identity/templates/illustrated/config')

Component({
  properties: {
    pet: {
      type: Object,
      value: null,
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
