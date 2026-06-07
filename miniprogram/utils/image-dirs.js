const IMAGE_UPLOAD_DIRS = {
  avatar: 'avatars',
  petCover: 'pet-spaces/covers',
  petAlbum: 'pet-spaces/albums',
  memory: 'pet-spaces/memories',
}

function getImageUploadDir(type) {
  return IMAGE_UPLOAD_DIRS[type] || 'uploads/images'
}

function getUserImageUploadDir(openid, type, options = {}) {
  const safeOpenid = sanitizePathPart(openid)
  const petSpaceId = sanitizePathPart(options.petSpaceId)

  if (!safeOpenid) {
    return ''
  }

  if (type === 'avatar') {
    return `users/${safeOpenid}/avatars`
  }

  if (type === 'petCover') {
    return petSpaceId
      ? `users/${safeOpenid}/pet-spaces/${petSpaceId}/covers`
      : `users/${safeOpenid}/pet-spaces/pending/covers`
  }

  if (type === 'petAlbum') {
    return petSpaceId
      ? `users/${safeOpenid}/pet-spaces/${petSpaceId}/albums`
      : `users/${safeOpenid}/pet-spaces/pending/albums`
  }

  if (type === 'memory') {
    return petSpaceId
      ? `users/${safeOpenid}/pet-spaces/${petSpaceId}/memories`
      : `users/${safeOpenid}/pet-spaces/pending/memories`
  }

  return `users/${safeOpenid}/${getImageUploadDir(type)}`
}

function sanitizePathPart(value) {
  return typeof value === 'string'
    ? value.trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)
    : ''
}

module.exports = {
  IMAGE_UPLOAD_DIRS,
  getImageUploadDir,
  getUserImageUploadDir,
}
