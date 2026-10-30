import path from 'node:path'
import fs from 'node:fs'
import zlib from 'node:zlib'

const packages = [
  'browser-rum',
  'browser-logs',
  'browser-rum-slim',
  'browser-worker',
  'browser-rum-shopify',
  'browser-early-collection',
] as const

interface BundleSize {
  uncompressed: number
  gzipped: number
}

interface BundleSizes {
  [key: string]: BundleSize
}

export function getPackageName(file: string): string | undefined {
  let name: string
  if (file.includes('chunk')) {
    const { chunkName, packageName } =
      file.match(/chunks\/(?<chunkName>[a-zA-Z0-9]*)-[a-z0-9]*-datadog-(?<packageName>[a-z-]*)\.js/)?.groups ?? {}
    name = `${packageName}_${chunkName.replace(/^datadog/, '').toLowerCase()}`
  } else {
    name = file.replace('datadog-', '').replace('.js', '')
  }

  // Keys are used as metric names (`bundle_sizes.<key>`), which don't support dashes
  return name.replaceAll('-', '_')
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

  for (const file of fs.globSync('**/*.js', { cwd: packagePath })) {
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

  for (const pkg of packages) {
    Object.assign(bundleSizes, getPackageSize(pkg))
  }

  return bundleSizes
}
