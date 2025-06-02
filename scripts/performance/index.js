const { runMain } = require('../lib/executionUtils')
const { LOCAL_BRANCH, fetchPR, getLastCommonCommit } = require('../lib/gitUtils')
const { reportAsPrComment } = require('./lib/reportAsAPrComment')
const { runCpuPerformance } = require('./lib/cpuPerformance')
const { runBundleSizes } = require('./lib/bundleSizes')
const { runMemoryPerformance } = require('./lib/memoryPerformance')

runMain(async () => {
  const pr = await fetchPR(LOCAL_BRANCH)
  if (!pr) {
    console.log('No pull requests found for the branch')
    return
  }

  const prComment = reportAsPrComment(pr)
  const lastCommonCommit = getLastCommonCommit(pr.base.ref, LOCAL_BRANCH)

  const options = {
    pr,
    prComment,
    lastCommonCommit,
  }

  await Promise.all([runCpuPerformance(options), runBundleSizes(options), runMemoryPerformance(options)])
})
