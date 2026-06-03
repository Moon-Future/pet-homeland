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
      { label: "首页", icon: "/assets/icons/sparkle.svg", active: true },
      { label: "小窝", icon: "/assets/icons/memorial.svg" },
      { label: "发现", icon: "/assets/icons/star.svg" },
      { label: "我的", icon: "/assets/icons/paw.svg" },
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
    wx.showToast({
      title: `${name} 的小窝开发中`,
      icon: "none",
    });
  },
});
