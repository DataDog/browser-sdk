import { calculateBundleSizes, formatSize } from './lib/computeBundleSize'
import { printLog, runMain } from './lib/executionUtils'

const COL_WIDTH = 12

runMain(() => {
  const bundleSizes = calculateBundleSizes()

  printRow('Bundle', 'Size', 'Gzip')
  printRow('-'.repeat(COL_WIDTH), '-'.repeat(COL_WIDTH), '-'.repeat(COL_WIDTH))

  for (const [key, size] of Object.entries(bundleSizes)) {
    printRow(key, formatSize(size.uncompressed), formatSize(size.gzipped))
  }
})

function printRow(key: string, ...values: string[]): void {
  printLog(`${key.padEnd(COL_WIDTH)} | ${values.map((value) => value.padStart(COL_WIDTH)).join(' | ')}`)
}
