Page({
  data: {
    user: { name: '奶球', avatar: '/assets/home/default-pet.png', vip: true, date: '2018.05.03 - 2026.04.18' },
    stats: [
      { label: '宠物', value: 3 },
      { label: '关注', value: 12 },
      { label: '粉丝', value: 28 },
      { label: '访客', value: 128 },
    ],
    services: [
      { label: 'AI回忆', icon: '/assets/icons/book.svg', url: '/pages/ai-book/index' },
      { label: '纪念海报', icon: '/assets/icons/album.svg', url: '/pages/album/index' },
      { label: '写给主人', icon: '/assets/icons/letter.svg', url: '/pages/ai-letter/index' },
      { label: '宠物档案', icon: '/assets/icons/memorial.svg', url: '/pages/pet-detail/index' },
    ],
    more: [
      { label: '纪念日提醒', icon: '/assets/icons/timeline.svg' },
      { label: '备份云存档', icon: '/assets/icons/star.svg' },
      { label: '意见反馈', icon: '/assets/icons/share.svg' },
      { label: '分享给好友', icon: '/assets/icons/heart.svg' },
    ],
  },

  go(e) {
    const { url } = e.currentTarget.dataset
    if (!url) return

    if (url === '/pages/pet-detail/index') {
      wx.switchTab({ url })
      return
    }

    wx.navigateTo({ url })
  },
})
