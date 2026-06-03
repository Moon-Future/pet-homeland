Page({
  data: {
    pet: { name: "奶球", avatar: "/assets/home/default-pet.svg", date: "2018.05.03 - 2026.04.18" },
  },

  startRead() {
    wx.showToast({ title: "AI 回忆录开发中", icon: "none" });
  },
});
