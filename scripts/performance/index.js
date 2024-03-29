const { runMain } = require('../lib/execution-utils')
const { reportAsPrComment } = require('./report-as-a-pr-comment')
const { reportToDatadog } = require('./report-to-datadog')
const { calculateBundleSizes } = require('./bundle-size/bundle-size-calculator')
// const { calculateCpuPerformance } = require('./cpu-performance/cpu-performance-calculator.js')

runMain(async () => {
  const bundleSizes = calculateBundleSizes()
  const cpuPerformance = []

  await reportToDatadog(bundleSizes)
  await reportAsPrComment(bundleSizes, cpuPerformance)
})
