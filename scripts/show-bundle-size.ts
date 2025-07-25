import { calculateBundleSizes, formatSize } from './lib/computeBundleSize.js'
import { printLog, runMain } from './lib/executionUtils.js'

const COL_WIDTH = 12

interface BundleSizes {
  [key: string]: {
    uncompressed: number
    gzipped: number
  }
}

runMain(() => {
  const bundleSizes = calculateBundleSizes() as BundleSizes

  printRow('Bundle', 'Size', 'Gzip')
  printRow('-'.repeat(COL_WIDTH), '-'.repeat(COL_WIDTH), '-'.repeat(COL_WIDTH))

  for (const [key, size] of Object.entries(bundleSizes)) {
    printRow(key, formatSize(size.uncompressed), formatSize(size.gzipped))
  }
})

function printRow(key: string, ...values: string[]) {
  printLog(`${key.padEnd(COL_WIDTH)} | ${values.map((value) => value.padStart(COL_WIDTH)).join(' | ')}`)
}
