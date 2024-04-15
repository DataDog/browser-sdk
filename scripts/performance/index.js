const { runMain } = require('../lib/execution-utils')
const { reportAsPrComment } = require('./report-as-a-pr-comment')
const { reportToDatadog } = require('./report-to-datadog')
const { calculateBundleSizes } = require('./bundle-size/compute-bundle-size')
const { computeCpuPerformance } = require('./cpu-performance/compute-cpu-performance')

runMain(async () => {
  const localBundleSizes = calculateBundleSizes()
  const dummy = await computeCpuPerformance()
  await reportToDatadog(localBundleSizes)
  await reportAsPrComment(localBundleSizes, dummy)
})
