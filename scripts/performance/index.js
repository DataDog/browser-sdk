const { runMain } = require('../lib/execution-utils')
const { command } = require('../lib/command')
const { reportAsPrComment, fetchPR, LOCAL_BRANCH } = require('./report-as-a-pr-comment')
const { reportToDatadog } = require('./report-to-datadog')
const { calculateBundleSizes } = require('./bundle-size/bundle-size-calculator')
const { updateStartUrl, syntheticTrigger } = require('./cpu-performance/synthetic-trigger')
// const { calculateCpuPerformance } = require('./cpu-performance/cpu-performance-calculator.js')

runMain(async () => {
  const PR_NUMBER = (await fetchPR(LOCAL_BRANCH)).number
  const bundleSizes = calculateBundleSizes()
  updateStartUrl(PR_NUMBER)
  syntheticTrigger()
  const cpuPerformance = []
  command`node ../deploy/deploy.js staging ${PR_NUMBER} pull-request`.run()
  await reportToDatadog(bundleSizes)
  await reportAsPrComment(bundleSizes, cpuPerformance)
})
