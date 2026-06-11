const storage = require('../../../../utils/storage')
const template = require('./config')

const defaultPetImage = storage.defaultPetImage
const starUrl = 'https://qiniu.cdn.cl8023.com/project/star-pet/assets/cards/card02-star.png'
const residentBadgeUrl = 'https://qiniu.cdn.cl8023.com/project/star-pet/assets/cards/card02-resident.png'
const qrCodeUrl = 'https://qiniu.cdn.cl8023.com/project/star-pet/assets/images/qrcode.jpg'

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function getImageAsset(src, fallback = defaultPetImage) {
  return new Promise((resolve) => {
    if (!src) {
      resolve({ path: fallback, width: 0, height: 0 })
      return
    }

    wx.getImageInfo({
      src,
      success: (res) => resolve({
        path: res.path,
        width: res.width || 0,
        height: res.height || 0,
      }),
      fail: () => resolve({ path: fallback, width: 0, height: 0 }),
    })
  })
}

function exportCanvas(page, canvasId, width, height) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvasId,
      width,
      height,
      destWidth: width,
      destHeight: height,
      fileType: 'png',
      quality: 1,
      success: (res) => resolve(res.tempFilePath),
      fail: () => reject(new Error('导出分享图失败')),
    }, page)
  })
}

function drawText(ctx, text, x, y, options = {}) {
  ctx.setFillStyle(options.color || '#12145d')
  ctx.setFontSize(options.size || 28)
  ctx.setTextAlign(options.align || 'left')
  ctx.setTextBaseline('top')
  ctx.fillText(text || '', x, y)
}

function getTextWidth(text, fontSize) {
  const value = String(text || '')
  let width = 0
  for (let index = 0; index < value.length; index += 1) {
    width += value.charCodeAt(index) > 255 ? fontSize : fontSize * 0.58
  }
  return Math.ceil(width)
}

function truncate(text, maxLength) {
  const value = String(text || '')
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}

function drawImageContain(ctx, asset, x, y, width, height) {
  if (!asset.path) {
    return
  }

  const sourceWidth = asset.width || width
  const sourceHeight = asset.height || height
  const scale = Math.min(width / sourceWidth, height / sourceHeight)
  const drawWidth = Math.round(sourceWidth * scale)
  const drawHeight = Math.round(sourceHeight * scale)
  const drawX = x + Math.round((width - drawWidth) / 2)
  const drawY = y + Math.round((height - drawHeight) / 2)
  ctx.drawImage(asset.path, drawX, drawY, drawWidth, drawHeight)
}

function drawAvatar(ctx, avatarAsset, x, y, width, height, radius) {
  ctx.save()
  roundRect(ctx, x, y, width, height, radius)
  ctx.clip()

  const sourceWidth = avatarAsset.width || width
  const sourceHeight = avatarAsset.height || height
  const scale = Math.max(width / sourceWidth, height / sourceHeight)
  const paintWidth = Math.round(sourceWidth * scale)
  const paintHeight = Math.round(sourceHeight * scale)
  const paintX = x + Math.round((width - paintWidth) / 2)
  const paintY = y + Math.round((height - paintHeight) / 2)
  ctx.drawImage(avatarAsset.path, paintX, paintY, paintWidth, paintHeight)
  ctx.restore()
}

function drawFact(ctx, icon, label, value, x, y) {
  ctx.setFillStyle('#6655e5')
  roundRect(ctx, x, y - 1, 34, 34, 8)
  ctx.fill()
  drawText(ctx, icon, x + 17, y + 4, { color: '#ffffff', size: 18, align: 'center' })
  drawText(ctx, label, x + 54, y, { color: '#2c2aae', size: 27 })
  drawText(ctx, truncate(value || '-', 14), x + 250, y, { color: '#14207d', size: 27 })
}

async function drawPoster({ page, canvasId, pet }) {
  const { layout } = template
  const width = layout.posterWidthPx
  const height = layout.posterHeightPx
  const ctx = wx.createCanvasContext(canvasId, page)
  const avatarAsset = await getImageAsset(pet.avatar)
  const starAsset = await getImageAsset(starUrl, '')
  const residentBadgeAsset = await getImageAsset(residentBadgeUrl, '')
  const qrAsset = await getImageAsset(qrCodeUrl, '')

  ctx.setFillStyle('#f7f1ff')
  ctx.fillRect(0, 0, width, height)

  const cardX = 28
  const cardY = 30
  const cardW = width - 56
  const cardH = height - 60
  const radius = 42
  const gradient = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH)
  gradient.addColorStop(0, '#fbf8ff')
  gradient.addColorStop(0.5, '#f0eaff')
  gradient.addColorStop(1, '#fff7ff')
  ctx.setFillStyle(gradient)
  roundRect(ctx, cardX, cardY, cardW, cardH, radius)
  ctx.fill()
  ctx.setStrokeStyle('rgba(151,121,236,0.46)')
  ctx.setLineWidth(4)
  ctx.stroke()

  const avatarX = 78
  const avatarY = 78
  const avatarW = 590
  const avatarH = 704
  ctx.setStrokeStyle('rgba(159,130,232,0.5)')
  ctx.setLineWidth(5)
  roundRect(ctx, avatarX, avatarY, avatarW, avatarH, 28)
  ctx.stroke()
  drawAvatar(ctx, avatarAsset, avatarX + 6, avatarY + 6, avatarW - 12, avatarH - 12, 24)

  const mainX = 720
  drawText(ctx, '星宠乡', mainX, 84, { color: '#2622bd', size: 60 })
  ctx.setStrokeStyle('rgba(86,78,214,0.24)')
  ctx.setLineWidth(2)
  ctx.beginPath()
  ctx.moveTo(930, 84)
  ctx.lineTo(930, 158)
  ctx.stroke()
  drawText(ctx, '记录每一份爱与陪伴', 982, 106, { color: '#4438d2', size: 32 })
  if (starAsset.path) {
    drawImageContain(ctx, starAsset, 1358, 58, 104, 104)
  }

  const panelX = 710
  const panelY = 200
  ctx.setFillStyle('rgba(255,255,255,0.72)')
  roundRect(ctx, panelX, panelY, 730, 580, 34)
  ctx.fill()

  const titleY = 246
  const petName = truncate(pet.petName || '-', 5)
  const contentX = panelX + 40
  drawText(ctx, petName, contentX, titleY, { color: '#11165f', size: 54 })
  let titleCursorX = contentX + getTextWidth(petName, 54) + 24
  if (pet.genderSymbol) {
    drawText(ctx, pet.genderSymbol, titleCursorX, titleY + 4, { color: pet.gender === 'female' ? '#f45c88' : '#3e99ef', size: 44 })
    titleCursorX += getTextWidth(pet.genderSymbol, 44) + 24
  }
  const breedText = truncate(pet.breed || '居民', 4)
  const breedWidth = Math.max(94, getTextWidth(breedText, 26) + 42)
  ctx.setFillStyle('#8260e8')
  roundRect(ctx, titleCursorX, titleY - 2, breedWidth, 52, 12)
  ctx.fill()
  drawText(ctx, breedText, titleCursorX + breedWidth / 2, titleY + 11, { color: '#fff', size: 26, align: 'center' })

  drawText(ctx, '身份编号：', contentX, 330, { color: '#3b31c7', size: 28 })
  drawText(ctx, pet.identityNo || '-', contentX, 374, { color: '#12145d', size: 58 })
  ctx.setStrokeStyle('rgba(68,56,210,0.28)')
  ctx.setLineWidth(2)
  ctx.beginPath()
  ctx.moveTo(contentX, 458)
  ctx.lineTo(contentX + 500, 458)
  ctx.stroke()

  const facts = [
    ['生', '出生时间', pet.birthDate || '-'],
    ['家', '来到身边', pet.arrivalDate || '-'],
    ['档', '宠物档案', pet.oneLineDescription || pet.breed || '-'],
  ]
  if (pet.lifeStatus === 'in_stars' && pet.deathDate) {
    facts.push(['星', '离去时间', pet.deathDate])
  }
  facts.forEach((item, index) => {
    drawFact(ctx, item[0], item[1], item[2], contentX, 500 + index * 58)
  })

  if (residentBadgeAsset.path) {
    drawImageContain(ctx, residentBadgeAsset, 1250, 268, 164, 164)
  }

  if (qrAsset.path) {
    const qrSize = 96
    const qrX = 1306
    const qrY = 650
    ctx.setFillStyle('rgba(255,255,255,0.9)')
    roundRect(ctx, qrX - 12, qrY - 12, qrSize + 24, qrSize + 24, 20)
    ctx.fill()
    ctx.drawImage(qrAsset.path, qrX, qrY, qrSize, qrSize)
  }

  return new Promise((resolve, reject) => {
    ctx.draw(false, async () => {
      try {
        resolve(await exportCanvas(page, canvasId, width, height))
      } catch (error) {
        reject(error)
      }
    })
  })
}

module.exports = {
  drawPoster,
}
