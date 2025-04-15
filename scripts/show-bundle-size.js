const { calculateBundleSizes, formatSize } = require('./lib/computeBundleSize.js')
const { printLog, runMain } = require('./lib/executionUtils')

const COL_WIDTH = 14

runMain(() => {
  const bundleSizes = calculateBundleSizes()

  printRow('Bundle', 'Size', 'Gzip')
  printRow('-'.repeat(COL_WIDTH), '-'.repeat(COL_WIDTH), '-'.repeat(COL_WIDTH))

  for (const [key, size] of Object.entries(bundleSizes)) {
    printRow(key, formatSize(size.uncompressed), formatSize(size.gzipped))
  }
})

function printRow(key, ...values) {
  printLog(`${key.padEnd(COL_WIDTH)} | ${values.map((value) => value.padStart(COL_WIDTH)).join(' | ')}`)
}
