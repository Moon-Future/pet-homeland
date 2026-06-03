Page({
  data: {
    homeBg: "https://qiniu.cdn.cl8023.com/project/star-paws/images/home-bg.png",
    recentMemorial: {
      petName: "奶球",
      relationDays: 2116,
      message: "今天有 12 位朋友来看它",
      avatar: "/assets/home/default-pet.svg",
      supporters: ["晴", "安", "夏", "米"],
    },
    navItems: [
      { label: "首页", icon: "/assets/icons/sparkle.svg", active: true },
      { label: "纪念馆", icon: "/assets/icons/memorial.svg" },
      { label: "发现", icon: "/assets/icons/star.svg" },
      { label: "我的", icon: "/assets/icons/paw.svg" },
    ],
  },

  onCreateMemorial() {
    wx.showToast({
      title: "创建流程开发中",
      icon: "none",
    });
  },

  onViewAll() {
    wx.showToast({
      title: "纪念馆列表开发中",
      icon: "none",
    });
  },
});
