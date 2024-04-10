const { runMain } = require('../lib/execution-utils')
const { fetchPR, LOCAL_BRANCH } = require('../lib/git-utils')
const { reportAsPrComment, LOCAL_COMMIT_SHA } = require('./report-as-a-pr-comment')
const { reportToDatadog } = require('./report-to-datadog')
const { calculateBundleSizes } = require('./bundle-size/bundle-size-calculator')
const { syntheticTrigger } = require('./cpu-performance/synthetic-trigger')
const ONE_MINUTE_IN_SECOND = 60 * 1000

runMain(async () => {
  const PR_NUMBER = (await fetchPR(LOCAL_BRANCH)).number
  const bundleSizes = calculateBundleSizes()
  await syntheticTrigger(PR_NUMBER, LOCAL_COMMIT_SHA)
  await new Promise((resolve) => setTimeout(resolve, ONE_MINUTE_IN_SECOND)) // Waiting for synthetic test to finish
  await reportToDatadog(bundleSizes)
  await reportAsPrComment(bundleSizes)
})
