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
      story: "你是我每天醒来都会想抱抱的小太阳。今天也要一起散步、吃饭、晒太阳，把普通日子过成闪闪发光的回忆。",
    },
    actions: [
      { label: "贴贴", icon: "/assets/icons/heart.svg" },
      { label: "记录今天", icon: "/assets/icons/flower.svg" },
      { label: "收藏星光", icon: "/assets/icons/star.svg" },
      { label: "送零食", icon: "/assets/icons/paw.svg" },
    ],
    stats: [
      { label: "贴贴", value: 528 },
      { label: "回忆", value: 221 },
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
