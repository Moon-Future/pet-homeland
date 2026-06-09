const storage = require('../../../../utils/storage')

const defaultPetImage = storage.defaultPetImage
const template = require('./config')

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

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines, align = 'left') {
  const content = text || ''
  const charsPerLine = Math.max(8, Math.floor(maxWidth / 28))
  ctx.setTextAlign(align)

  for (let index = 0; index < maxLines; index += 1) {
    const start = index * charsPerLine
    if (start >= content.length) {
      break
    }

    let line = content.slice(start, start + charsPerLine)
    if (index === maxLines - 1 && start + charsPerLine < content.length) {
      line = `${line.slice(0, Math.max(0, line.length - 1))}…`
    }
    ctx.fillText(line, x, y + index * lineHeight)
  }
}

function getImageAsset(src, fallback = defaultPetImage) {
  return new Promise((resolve) => {
    if (!src) {
      resolve({
        path: fallback,
        width: 0,
        height: 0,
      })
      return
    }

    wx.getImageInfo({
      src,
      success: (res) => resolve({
        path: res.path,
        width: res.width || 0,
        height: res.height || 0,
      }),
      fail: () => resolve({
        path: fallback,
        width: 0,
        height: 0,
      }),
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

async function drawPoster({ page, canvasId, pet }) {
  const { assets, layout } = template
  const backgroundAsset = await getImageAsset(assets.backgroundUrl, '')
  const elementAsset = await getImageAsset(assets.elementUrl, '')
  const avatarAsset = await getImageAsset(pet.avatar)
  const qrAsset = await getImageAsset(assets.qrCodeUrl, '')
  const width = layout.posterWidthPx
  const height = layout.posterHeightPx
  const scale = width / layout.designWidthRpx
  const ctx = wx.createCanvasContext(canvasId, page)
  const { elementLayer, avatar, info, qr } = layout

  ctx.setFillStyle('#fff8ef')
  ctx.fillRect(0, 0, width, height)

  if (backgroundAsset.path) {
    ctx.drawImage(backgroundAsset.path, 0, 0, width, height)
  }

  if (elementAsset.path) {
    const elementWidth = width * elementLayer.widthRatio
    const elementHeight = height * elementLayer.heightRatio
    const elementX = (width - elementWidth) / 2
    const elementY = elementLayer.alignBottom ? (height - elementHeight) : 0
    ctx.drawImage(elementAsset.path, elementX, elementY, elementWidth, elementHeight)
  }

  const avatarShellX = Math.round(avatar.x * scale)
  const avatarShellY = Math.round(avatar.y * scale)
  const avatarShellW = Math.round(avatar.width * scale)
  const avatarShellH = Math.round(avatar.height * scale)
  const avatarInnerPad = Math.round(avatar.padding * scale)
  const avatarCenterX = avatarShellX + avatarShellW / 2
  const avatarCenterY = avatarShellY + avatarShellH / 2
  const avatarRotation = avatar.rotateDeg * Math.PI / 180

  ctx.save()
  ctx.translate(avatarCenterX, avatarCenterY)
  ctx.rotate(avatarRotation)
  ctx.translate(-avatarCenterX, -avatarCenterY)
  ctx.setFillStyle('#ffffff')
  roundRect(
    ctx,
    avatarShellX,
    avatarShellY,
    avatarShellW,
    avatarShellH,
    Math.round(avatar.radius * scale)
  )
  ctx.fill()
  ctx.setStrokeStyle('rgba(233, 196, 150, 0.9)')
  ctx.setLineWidth(2)
  ctx.stroke()
  const avatarDrawX = avatarShellX + avatarInnerPad
  const avatarDrawY = avatarShellY + avatarInnerPad
  const avatarDrawW = avatarShellW - avatarInnerPad * 2
  const avatarDrawH = avatarShellH - avatarInnerPad * 2
  const avatarSourceWidth = avatarAsset.width || avatarDrawW
  const avatarSourceHeight = avatarAsset.height || avatarDrawH
  const avatarScale = Math.max(
    avatarDrawW / avatarSourceWidth,
    avatarDrawH / avatarSourceHeight
  )
  const avatarPaintW = Math.round(avatarSourceWidth * avatarScale)
  const avatarPaintH = Math.round(avatarSourceHeight * avatarScale)
  const avatarPaintX = avatarDrawX + Math.round((avatarDrawW - avatarPaintW) / 2)
  const avatarPaintY = avatarDrawY + Math.round((avatarDrawH - avatarPaintH) / 2)

  roundRect(
    ctx,
    avatarDrawX,
    avatarDrawY,
    avatarDrawW,
    avatarDrawH,
    Math.round(avatar.innerRadius * scale)
  )
  ctx.clip()
  ctx.drawImage(
    avatarAsset.path,
    avatarPaintX,
    avatarPaintY,
    avatarPaintW,
    avatarPaintH
  )
  ctx.restore()

  const infoRows = [
    ['姓名', pet.petName || '-'],
    ['ID', pet.identityNo || '-'],
    ['品种', pet.breed || '-'],
  ]

  if (pet.birthDate) {
    infoRows.push(['生日', pet.birthDate])
  }

  if (pet.arrivalDate) {
    infoRows.push(['到家日', pet.arrivalDate])
  }

  if (pet.lifeStatus === 'in_stars' && pet.deathDate) {
    infoRows.push(['去星星日', pet.deathDate])
  }

  const infoLabelX = Math.round(info.labelX * scale)
  const infoValueX = Math.round(info.valueX * scale)
  ctx.setTextBaseline('top')
  let rowY = Math.round(info.startY * scale)
  infoRows.forEach(([label, value]) => {
    ctx.setFillStyle('#b98b62')
    ctx.setTextAlign('left')
    ctx.setFontSize(Math.round(info.labelFont * scale))
    ctx.fillText(label, infoLabelX, rowY)

    ctx.setFillStyle(label === 'ID' ? '#df835b' : '#5f3c25')
    ctx.setFontSize(Math.round(info.valueFont * scale))
    drawWrappedText(
      ctx,
      value || '-',
      infoValueX,
      rowY - Math.round(1 * scale),
      Math.round(info.valueWidth * scale),
      Math.round(info.lineHeight * scale),
      label === 'ID' ? 2 : 1,
      'left'
    )

    rowY += Math.round(info.rowHeight * scale)
  })

  ctx.setFillStyle('#b98b62')
  ctx.setTextAlign('left')
  ctx.setFontSize(Math.round(info.labelFont * scale))
  ctx.fillText(info.descLabel, infoLabelX, rowY + Math.round(2 * scale))
  ctx.setFillStyle('#5f3c25')
  ctx.setFontSize(Math.round(info.valueFont * scale))
  drawWrappedText(
    ctx,
    pet.oneLineDescription || '-',
    infoValueX,
    rowY,
    Math.round(info.descWidth * scale),
    Math.round(info.descLineHeight * scale),
    info.descLines,
    'left'
  )

  const qrSize = Math.round(qr.size * scale)
  const qrX = width - Math.round(qr.right * scale) - qrSize
  const qrY = height - Math.round(qr.bottom * scale) - qrSize
  if (qrAsset.path) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(qrX + qrSize / 2, qrY + qrSize / 2, qrSize / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(qrAsset.path, qrX, qrY, qrSize, qrSize)
    ctx.restore()
  }

  return new Promise((resolve, reject) => {
    ctx.draw(false, async () => {
      try {
        const tempFilePath = await exportCanvas(page, canvasId, width, height)
        resolve(tempFilePath)
      } catch (error) {
        reject(error)
      }
    })
  })
}

module.exports = {
  drawPoster,
}
