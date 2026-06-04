const IMAGE_UPLOAD_DIRS = {
  avatar: 'users/avatars',
  petCover: 'pet-spaces/covers',
  petAlbum: 'pet-spaces/albums',
  memory: 'pet-spaces/memories',
}

function getImageUploadDir(type) {
  return IMAGE_UPLOAD_DIRS[type] || 'uploads/images'
}

module.exports = {
  IMAGE_UPLOAD_DIRS,
  getImageUploadDir,
}
