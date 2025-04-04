const { calculateBundleSizes, formatSize } = require('./lib/computeBundleSize.js')
const { printLog, runMain } = require('./lib/executionUtils')

const COL_WIDTH = 12

runMain(() => {
  const bundleSizes = calculateBundleSizes()
  const bundleSizesGzip = calculateBundleSizes(true)

  printRow('Bundle', 'Size', 'Gzip')
  printRow('-'.repeat(COL_WIDTH), '-'.repeat(COL_WIDTH), '-'.repeat(COL_WIDTH))

  for (const [key, value] of Object.entries(bundleSizes)) {
    printRow(key, formatSize(value), formatSize(bundleSizesGzip[key]))
  }
})

function printRow(key, ...values) {
  printLog(`${key.padEnd(COL_WIDTH)} | ${values.map((value) => value.padStart(COL_WIDTH)).join(' | ')}`)
}
