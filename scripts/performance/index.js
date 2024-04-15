const { runMain } = require('../lib/execution-utils')
const { fetchPR, LOCAL_BRANCH } = require('../lib/git-utils')
const { reportAsPrComment, LOCAL_COMMIT_SHA } = require('./report-as-a-pr-comment')
const { reportToDatadog } = require('./report-to-datadog')
const { calculateBundleSizes } = require('./bundle-size/bundle-size-calculator')
const { triggerSyntheticsTest, waitForSyntheticsTestToFinish } = require('./cpu-performance/synthetics-trigger')

const RETRIES_NUMBER = 6 // Number of retries to get the synthetic test result

runMain(async () => {
  const prNumber = (await fetchPR(LOCAL_BRANCH)).number
  const bundleSizes = calculateBundleSizes()
  const resultId = await triggerSyntheticsTest(prNumber, LOCAL_COMMIT_SHA)
  await waitForSyntheticsTestToFinish(resultId, RETRIES_NUMBER)
  await reportToDatadog(bundleSizes)
  await reportAsPrComment(bundleSizes)
})
