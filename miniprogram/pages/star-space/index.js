Page({
  data: {
    stars: [
      { name: "奶球", x: 52, y: 40 },
      { name: "可乐", x: 22, y: 28 },
      { name: "小黑", x: 78, y: 62 },
      { name: "豆豆", x: 35, y: 72 },
      { name: "团子", x: 68, y: 22 },
    ],
  },

  lightStar() {
    wx.showToast({ title: "点亮一颗星开发中", icon: "none" });
  },
});
