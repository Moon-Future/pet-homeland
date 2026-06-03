Page({
  data: {
    homeBg: 'https://qiniu.cdn.cl8023.com/project/star-paws/images/home-bg.png',
    featuredPet: {
      petName: '奶球',
      lifeStatus: 'with_me',
      statusText: '陪伴中',
      statusClass: 'status-with-me',
      recentTitle: '最近陪伴',
      dayLabel: '陪伴',
      relationDays: 2116,
      message: '今天记录了一段新的陪伴',
      avatar: '/assets/home/default-pet.png',
      supporters: ['晴', '安', '夏', '米'],
    },
    petSpaces: [
      {
        id: 'pet-1',
        petName: '奶球',
        active: true,
        statusText: '陪伴中',
        statusClass: 'status-with-me',
        dayLabel: '陪伴',
        days: 2116,
        avatar: '/assets/home/default-pet.png',
      },
      {
        id: 'pet-2',
        petName: '可乐',
        statusText: '已去星星',
        statusClass: 'status-in-stars',
        dayLabel: '离开',
        days: 721,
        avatar: '/assets/home/default-pet.png',
      },
      {
        id: 'pet-3',
        petName: '小黑',
        statusText: '陪伴中',
        statusClass: 'status-with-me',
        dayLabel: '陪伴',
        days: 980,
        avatar: '/assets/home/default-pet.png',
      },
    ],
  },

  onCreateMemorial() {
    wx.navigateTo({
      url: '/pages/pet-create/index',
    })
  },

  onViewAll() {
    wx.switchTab({
      url: '/pages/profile/index',
    })
  },

  onSelectPet() {
    wx.switchTab({
      url: '/pages/pet-detail/index',
    })
  },

  onNavTap(e) {
    const { url } = e.currentTarget.dataset
    if (!url || url === '/pages/index/index') {
      return
    }
    wx.switchTab({ url })
  },
})
