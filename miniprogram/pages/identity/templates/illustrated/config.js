const qrCodeUrl = 'https://qiniu.cdn.cl8023.com/project/star-pet/assets/images/qrcode.jpg'
const backgroundUrl = 'https://qiniu.cdn.cl8023.com/project/star-pet/assets/cards/card01-bg.png'
const elementUrl = 'https://qiniu.cdn.cl8023.com/project/star-pet/assets/cards/card01-ele01.png'

const layout = {
  designWidthRpx: 750,
  posterWidthPx: 1536,
  posterHeightPx: 1008,
  elementLayer: {
    widthRatio: 0.96,
    heightRatio: 0.98,
    alignBottom: true,
  },
  avatar: {
    x: 46,
    y: 200,
    width: 120,
    height: 170,
    padding: 6,
    radius: 10,
    innerRadius: 6,
    rotateDeg: -5,
  },
  info: {
    labelX: 198,
    valueX: 300,
    startY: 180,
    labelFont: 24,
    valueFont: 24,
    valueWidth: 224,
    lineHeight: 21,
    rowHeight: 40,
    descLabel: '小档案',
    descWidth: 230,
    descLineHeight: 21,
    descLines: 3,
  },
  qr: {
    right: 34,
    bottom: 20,
    size: 60,
  },
}

module.exports = {
  id: 'illustrated',
  assets: {
    qrCodeUrl,
    backgroundUrl,
    elementUrl,
  },
  layout,
}
