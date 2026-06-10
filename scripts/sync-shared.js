#!/usr/bin/env node
/**
 * Sync cloudfunctions/_shared/* into each cloud function's local copy.
 *
 * Cloud functions are packaged independently by wx-server-sdk (no monorepo
 * support), so shared helpers must be physically copied. This script is the
 * single source of truth for which cloud function gets which shared file.
 *
 * Usage:
 *   node scripts/sync-shared.js          # sync all
 *   node scripts/sync-shared.js --check  # exit 1 if anything would change
 *
 * After editing cloudfunctions/_shared/*.js, run this script before deploy.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SHARED_DIR = path.join(ROOT, 'cloudfunctions', '_shared')

// Map: cloud function name -> shared file (under _shared/) -> output filename
// `storage.lite.js` is renamed to `storage.js` on the destination side so call
// sites can keep `require('./storage')` regardless of which variant they use.
const MANIFEST = {
  // Write-side: needs deleteObjects (qiniu SDK dependency)
  cleanupUserMedia:{ 'storage.js':      'storage.js' },
  cleanupRefs:     { 'storage.js':      'storage.js', 'grant.js': 'grant.js' },
  createPetSpace:  { 'grant.js':        'grant.js', 'upload-ref.js': 'upload-ref.js' },
  addMemory:       { 'upload-ref.js':   'upload-ref.js' },
  updateMemory:    { 'storage.js':      'storage.js', 'upload-ref.js': 'upload-ref.js' },
  updatePetSpace:  { 'storage.js':      'storage.js', 'upload-ref.js': 'upload-ref.js' },
  login:           { 'storage.js':      'storage.js', 'grant.js': 'grant.js', 'upload-ref.js': 'upload-ref.js' },

  // Read-side: only needs buildUrl (no qiniu SDK)
  resolvePetIdentity:   { 'storage.lite.js': 'storage.js' },
  getAdminReviewItems:  { 'storage.lite.js': 'storage.js' },
  getMyPetSpaces:       { 'storage.lite.js': 'storage.js' },
  getMemories:          { 'storage.lite.js': 'storage.js' },
  getDiscoverPetSpaces: { 'storage.lite.js': 'storage.js' },
  getPetSpaceDetail:    { 'storage.lite.js': 'storage.js' },

  // Grant helpers: copied into functions that issue/verify upload grants.
  reservePetSpaceId:    { 'grant.js':        'grant.js' },
  getPetUploadGrant:    { 'grant.js':        'grant.js' },
  getQiniuUploadToken:  { 'grant.js':        'grant.js' },
}

const HEADER = '// AUTO-GENERATED — DO NOT EDIT.\n'
  + '// Edit cloudfunctions/_shared/<source>.js and run: node scripts/sync-shared.js\n\n'

function run({ check } = {}) {
  let drift = 0

  for (const [fnName, files] of Object.entries(MANIFEST)) {
    const fnDir = path.join(ROOT, 'cloudfunctions', fnName)
    if (!fs.existsSync(fnDir)) {
      console.warn(`[skip] cloud function not found: ${fnName}`)
      continue
    }

    for (const [sourceName, destName] of Object.entries(files)) {
      const sourcePath = path.join(SHARED_DIR, sourceName)
      const destPath = path.join(fnDir, destName)

      if (!fs.existsSync(sourcePath)) {
        throw new Error(`shared source missing: ${sourcePath}`)
      }

      const body = fs.readFileSync(sourcePath, 'utf8')
      const next = HEADER + body
      const current = fs.existsSync(destPath) ? fs.readFileSync(destPath, 'utf8') : ''

      if (current === next) {
        continue
      }

      drift += 1

      if (check) {
        console.error(`[drift] ${fnName}/${destName} would change`)
        continue
      }

      fs.writeFileSync(destPath, next)
      console.log(`[sync]  ${fnName}/${destName} <- _shared/${sourceName}`)
    }
  }

  if (check && drift > 0) {
    console.error(`\n${drift} file(s) out of sync. Run: node scripts/sync-shared.js`)
    process.exit(1)
  }

  if (!check) {
    console.log(drift === 0 ? 'all shared files in sync' : `synced ${drift} file(s)`)
  }
}

run({ check: process.argv.includes('--check') })
