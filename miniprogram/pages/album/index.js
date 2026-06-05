const auth = require('../../utils/auth')

Page({
  data: {
    filters: ['全部', '可爱瞬间', '旅行', '日常', '视频'],
    photos: [
      '/assets/home/default-pet.png',
      'https://qiniu.cdn.cl8023.com/project/star-paws/themes/sunset-flowers.png',
      'https://qiniu.cdn.cl8023.com/project/star-paws/themes/cloud-garden.png',
      'https://qiniu.cdn.cl8023.com/project/star-paws/themes/sakura-avenue.png',
      'https://qiniu.cdn.cl8023.com/project/star-paws/themes/starry-sky.png',
      '/assets/home/default-pet.png',
    ],
  },

  onLoad() {
    auth.requireLogin({
      redirectToProfile: true,
    })
  },
})
