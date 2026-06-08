// AUTO-GENERATED — DO NOT EDIT.
// Edit cloudfunctions/_shared/<source>.js and run: node scripts/sync-shared.js

// Shared HMAC-signed grant helpers for cloud functions.
// Sync source for all cloud function local copies.
// Edit this file, then run: node scripts/sync-shared.js

const crypto = require('crypto')

const SECRET = process.env.UPLOAD_GRANT_SECRET || ''

function signGrant(payload = {}) {
  if (!SECRET) {
    throw new Error('UPLOAD_GRANT_SECRET 未配置')
  }

  const normalized = normalizePayload(payload)
  const encodedPayload = base64UrlEncode(JSON.stringify(normalized))
  const signature = sign(encodedPayload)
  return `${encodedPayload}.${signature}`
}

function verifyGrant(token) {
  if (!SECRET) {
    throw new Error('UPLOAD_GRANT_SECRET 未配置')
  }

  const text = typeof token === 'string' ? token.trim() : ''
  const parts = text.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error('grant 无效')
  }

  const [encodedPayload, signature] = parts
  const expected = sign(encodedPayload)
  if (!timingSafeEqual(signature, expected)) {
    throw new Error('grant 签名无效')
  }

  let payload = null
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload))
  } catch (error) {
    throw new Error('grant 数据无效')
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('grant 数据无效')
  }

  const exp = Number(payload.exp || 0)
  if (!exp || Date.now() > exp) {
    throw new Error('grant 已过期')
  }

  return payload
}

function sign(text) {
  return base64UrlFromBuffer(
    crypto.createHmac('sha256', SECRET).update(String(text)).digest(),
  )
}

function timingSafeEqual(left, right) {
  const a = Buffer.from(String(left))
  const b = Buffer.from(String(right))
  if (a.length !== b.length) {
    return false
  }
  return crypto.timingSafeEqual(a, b)
}

function normalizePayload(payload = {}) {
  return JSON.parse(JSON.stringify(payload))
}

function base64UrlEncode(text) {
  return base64UrlFromBuffer(Buffer.from(String(text)))
}

function base64UrlDecode(text) {
  const normalized = String(text)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const padding = normalized.length % 4
  const padded = padding ? normalized + '='.repeat(4 - padding) : normalized
  return Buffer.from(padded, 'base64').toString('utf8')
}

function base64UrlFromBuffer(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

module.exports = {
  signGrant,
  verifyGrant,
}
