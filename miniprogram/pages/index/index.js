Page({
  data: {
    homeBg: "https://qiniu.cdn.cl8023.com/project/star-paws/images/home-bg.png",
    featuredPet: {
      petName: "奶球",
      lifeStatus: "with_me",
      statusText: "陪伴中",
      statusClass: "status-with-me",
      recentTitle: "最近陪伴",
      dayLabel: "陪伴",
      relationDays: 2116,
      message: "今天记录了一段新的陪伴",
      avatar: "/assets/home/default-pet.svg",
      supporters: ["晴", "安", "夏", "米"],
    },
    petSpaces: [
      {
        id: "pet-1",
        petName: "奶球",
        active: true,
        statusText: "陪伴中",
        statusClass: "status-with-me",
        dayLabel: "陪伴",
        days: 2116,
        avatar: "/assets/home/default-pet.svg",
      },
      {
        id: "pet-2",
        petName: "可乐",
        statusText: "已去星星",
        statusClass: "status-in-stars",
        dayLabel: "离开",
        days: 721,
        avatar: "/assets/home/default-pet.svg",
      },
      {
        id: "pet-3",
        petName: "小黑",
        statusText: "陪伴中",
        statusClass: "status-with-me",
        dayLabel: "陪伴",
        days: 980,
        avatar: "/assets/home/default-pet.svg",
      },
    ],
    navItems: [
      { label: "首页", icon: "/assets/icons/sparkle.svg", active: true, url: "/pages/index/index" },
      { label: "小窝", icon: "/assets/icons/memorial.svg", url: "/pages/pet-detail/index" },
      { label: "发现", icon: "/assets/icons/star.svg", url: "/pages/star-space/index" },
      { label: "我的", icon: "/assets/icons/paw.svg", url: "/pages/profile/index" },
    ],
  },

  onCreateMemorial() {
    wx.navigateTo({
      url: "/pages/pet-create/index",
    });
  },

  onViewAll() {
    wx.showToast({
      title: "宠物小窝列表开发中",
      icon: "none",
    });
  },

  onSelectPet(e) {
    const { name } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/pet-detail/index?name=${name}`,
    });
  },

  onNavTap(e) {
    const { url } = e.currentTarget.dataset;
    if (!url || url === "/pages/index/index") {
      return;
    }
    wx.navigateTo({ url });
  },
});
