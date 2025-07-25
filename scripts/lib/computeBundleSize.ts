import path from 'path'
import fs from 'fs'
import zlib from 'zlib'
import { glob } from 'glob'

const packages = ['rum', 'logs', 'flagging', 'rum-slim', 'worker'] as const

interface BundleSize {
  uncompressed: number
  gzipped: number
}

interface BundleSizes {
  [key: string]: BundleSize
}

interface ChunkMatchGroups {
  chunkName: string
  packageName: string
}

function getPackageName(file: string): string | undefined {
  if (file.includes('chunk')) {
    const match = file.match(/chunks\/(?<chunkName>[a-z0-9]*)-[a-z0-9]*-datadog-(?<packageName>[a-z-]*)\.js/)
    const groups = match?.groups as ChunkMatchGroups | undefined
    if (groups?.chunkName && groups?.packageName) {
      return `${groups.packageName}_${groups.chunkName}`
    }
    return undefined
  }

  return file
    .replace('datadog-', '')
    .replace('-', '_') // rename rum-slim to rum_slim
    .replace('.js', '')
}

function getGzippedBundleSize(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath)
    const gzipped = zlib.gzipSync(content)

    return gzipped.length
  } catch (error) {
    throw new Error('Failed to get gzipped bundle size', { cause: error })
  }
}

function getUncompressedBundleSize(filePath: string): number {
  try {
    const file = fs.statSync(filePath)

    return file.size
  } catch (error) {
    throw new Error('Failed to get bundle size', { cause: error })
  }
}

function getPackageSize(packageName: string): BundleSizes {
  const bundleSizes: BundleSizes = {}
  const packagePath = path.join(import.meta.dirname, `../../packages/${packageName}/bundle/`)

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

function calculateBundleSizes(): BundleSizes {
  const bundleSizes: BundleSizes = {}

  for (const pkg of packages) {
    Object.assign(bundleSizes, getPackageSize(pkg))
  }

  return bundleSizes
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`
  }

  return `${(bytes / 1024).toFixed(2)} KiB`
}

export { calculateBundleSizes, formatSize }
