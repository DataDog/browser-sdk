const { runMain } = require('../lib/executionUtils')
const { calculateBundleSizes } = require('../lib/computeBundleSize')
const { reportAsPrComment } = require('./lib/reportAsAPrComment')
const { reportToDatadog } = require('./lib/reportToDatadog')
const { computeCpuPerformance } = require('./lib/computeCpuPerformance')
const { computeMemoryPerformance } = require('./lib/computeMemoryPerformance')

runMain(async () => {
  const localBundleSizes = extractUncompressedBundleSizes(calculateBundleSizes())
  const localMemoryPerformance = await computeMemoryPerformance()
  await computeCpuPerformance()
  await reportToDatadog(localMemoryPerformance, 'memoryPerformance')
  await reportToDatadog(localBundleSizes, 'bundleSizes')
  await reportAsPrComment(localBundleSizes, localMemoryPerformance)
})

// keep compatibility with the logs and PR comment format
function extractUncompressedBundleSizes(bundleSizes) {
  return Object.fromEntries(Object.entries(bundleSizes).map(([key, size]) => [key, size.uncompressed]))
}
