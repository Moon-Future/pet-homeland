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

function getImagePath(src, fallback = defaultPetImage) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(fallback)
      return
    }

    wx.getImageInfo({
      src,
      success: (res) => resolve(res.path),
      fail: () => resolve(fallback),
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
  const backgroundPath = await getImagePath(assets.backgroundUrl, '')
  const elementPath = await getImagePath(assets.elementUrl, '')
  const avatarPath = await getImagePath(pet.avatar)
  const qrPath = await getImagePath(assets.qrCodeUrl, '')
  const width = layout.posterWidthPx
  const height = layout.posterHeightPx
  const scale = width / layout.designWidthRpx
  const ctx = wx.createCanvasContext(canvasId, page)
  const { elementLayer, avatar, info, qr } = layout

  ctx.setFillStyle('#fff8ef')
  ctx.fillRect(0, 0, width, height)

  if (backgroundPath) {
    ctx.drawImage(backgroundPath, 0, 0, width, height)
  }

  if (elementPath) {
    const elementWidth = width * elementLayer.widthRatio
    const elementHeight = height * elementLayer.heightRatio
    const elementX = (width - elementWidth) / 2
    const elementY = elementLayer.alignBottom ? (height - elementHeight) : 0
    ctx.drawImage(elementPath, elementX, elementY, elementWidth, elementHeight)
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
  roundRect(
    ctx,
    avatarShellX + avatarInnerPad,
    avatarShellY + avatarInnerPad,
    avatarShellW - avatarInnerPad * 2,
    avatarShellH - avatarInnerPad * 2,
    Math.round(avatar.innerRadius * scale)
  )
  ctx.clip()
  ctx.drawImage(
    avatarPath,
    avatarShellX + avatarInnerPad,
    avatarShellY + avatarInnerPad,
    avatarShellW - avatarInnerPad * 2,
    avatarShellH - avatarInnerPad * 2
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
  if (qrPath) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(qrX + qrSize / 2, qrY + qrSize / 2, qrSize / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(qrPath, qrX, qrY, qrSize, qrSize)
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
