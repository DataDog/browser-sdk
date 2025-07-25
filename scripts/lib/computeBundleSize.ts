import * as path from 'path'
import * as fs from 'fs'
import * as zlib from 'zlib'
import { glob } from 'glob'

interface BundleSize {
  uncompressed: number
  gzipped: number
}

interface BundleSizes {
  [packageName: string]: BundleSize
}

const packages = ['rum', 'logs', 'flagging', 'rum-slim', 'worker'] as const

function getPackageName(file: string): string | undefined {
  if (file.includes('chunk')) {
    const match = file.match(/chunks\/(?<chunkName>[a-z0-9]*)-[a-z0-9]*-datadog-(?<packageName>[a-z-]*)\.js/)
    const { chunkName, packageName } = match?.groups ?? {}
    if (chunkName && packageName) {
      return `${packageName}_${chunkName}`
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
    const newError = new Error('Failed to get gzipped bundle size')
    ;(newError as any).cause = error
    throw newError
  }
}

function getUncompressedBundleSize(filePath: string): number {
  try {
    const file = fs.statSync(filePath)

    return file.size
  } catch (error) {
    const newError = new Error('Failed to get bundle size')
    ;(newError as any).cause = error
    throw newError
  }
}

function getPackageSize(packageName: string): BundleSizes {
  const bundleSizes: BundleSizes = {}
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

export function calculateBundleSizes(): BundleSizes {
  const bundleSizes: BundleSizes = {}

  for (const packageName of packages) {
    Object.assign(bundleSizes, getPackageSize(packageName))
  }

  return bundleSizes
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`
  }

  return `${(bytes / 1024).toFixed(2)} KiB`
}
