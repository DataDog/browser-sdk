const path = require('path')
const fs = require('fs')
const zlib = require('zlib')
const { glob } = require('glob')

const packages = ['rum', 'logs', 'rum-slim', 'worker']

function getPackageName(file) {
  if (file.includes('chunk')) {
    const { chunkName, packageName } =
      file.match(/chunks\/(?<chunkName>[a-z0-9]*)-[a-z0-9]*-datadog-(?<packageName>[a-z-]*)\.js/)?.groups ?? {}
    return `${packageName}-${chunkName}`
  }

  return file
    .replace('datadog-', '')
    .replace('-', '_') // rename rum-slim to rum_slim
    .replace('.js', '')
}

function getGzippedBundleSize(filePath) {
  try {
    const content = fs.readFileSync(filePath)
    const gzipped = zlib.gzipSync(content)

    return gzipped.length
  } catch (error) {
    throw new Error('Failed to get gzipped bundle size', { cause: error })
  }
}

function getUncompressedBundleSize(filePath) {
  try {
    const file = fs.statSync(filePath)

    return file.size
  } catch (error) {
    throw new Error('Failed to get bundle size', { cause: error })
  }
}

function getPackageSize(packageName) {
  const bundleSizes = {}
  const packagePath = path.join(__dirname, `../../packages/${packageName}/bundle/`)

  for (const file of glob.sync('**/*.js', { cwd: packagePath })) {
    const name = getPackageName(file)

    if (!name) {
      continue
    }

    const filePath = path.join(packagePath, file)

    bundleSizes[name] = {
      uncompressed: getUncompressedBundleSize(filePath),
      gzipped: getGzippedBundleSize(filePath),
    }
  }

  return bundleSizes
}

function calculateBundleSizes() {
  const bundleSizes = {}

  for (const package of packages) {
    Object.assign(bundleSizes, getPackageSize(package))
  }

  return bundleSizes
}

function formatSize(bytes) {
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`
  }

  return `${(bytes / 1024).toFixed(2)} KiB`
}

module.exports = {
  calculateBundleSizes,
  formatSize,
}
