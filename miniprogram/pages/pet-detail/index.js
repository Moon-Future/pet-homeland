Page({
  data: {
    pet: {
      name: "奶球",
      status: "陪伴中",
      birthday: "2018.05.03",
      today: "2026.06.03",
      days: 2911,
      avatar: "/assets/home/default-pet.svg",
      cover: "https://qiniu.cdn.cl8023.com/project/star-paws/images/home-bg.png",
      story: "你是我世界里最温暖的光，谢谢你来过我的生活。",
    },
    actions: [
      { label: "想你了", icon: "/assets/icons/heart.svg" },
      { label: "送花", icon: "/assets/icons/flower.svg" },
      { label: "点亮星光", icon: "/assets/icons/star.svg" },
      { label: "送零食", icon: "/assets/icons/paw.svg" },
    ],
    stats: [
      { label: "思念", value: 528 },
      { label: "鲜花", value: 221 },
      { label: "星光", value: 167 },
      { label: "零食", value: 98 },
    ],
  },

  goTimeline() {
    wx.navigateTo({ url: "/pages/timeline/index" });
  },

  goAlbum() {
    wx.navigateTo({ url: "/pages/album/index" });
  },

  goLetter() {
    wx.navigateTo({ url: "/pages/ai-letter/index" });
  },

  goBook() {
    wx.navigateTo({ url: "/pages/ai-book/index" });
  },

  goStarSpace() {
    wx.navigateTo({ url: "/pages/star-space/index" });
  },
});
