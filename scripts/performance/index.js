const { runMain } = require('../lib/execution-utils')
const { fetchPR, LOCAL_BRANCH } = require('../lib/git-utils')
const { reportAsPrComment } = require('./report-as-a-pr-comment')
const { reportToDatadog } = require('./report-to-datadog')
const { calculateBundleSizes } = require('./bundle-size/bundle-size-calculator')
const { syntheticTrigger } = require('./cpu-performance/synthetic-trigger')
// const { calculateCpuPerformance } = require('./cpu-performance/cpu-performance-calculator.js')

runMain(async () => {
  const PR_NUMBER = (await fetchPR(LOCAL_BRANCH)).number
  const bundleSizes = calculateBundleSizes()
  await syntheticTrigger(PR_NUMBER, process.env.CI_COMMIT_SHORT_SHA)
  await new Promise((resolve) => setTimeout(resolve, 60 * 1000))
  await reportToDatadog(bundleSizes)
  await reportAsPrComment(bundleSizes)
})
