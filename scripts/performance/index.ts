import { printLog, runMain } from '../lib/executionUtils.ts'
import { fetchPR, getLastCommonCommit, LOCAL_BRANCH } from '../lib/gitUtils.ts'
import { PrComment } from './lib/reportAsAPrComment.ts'
import { computeAndReportMemoryPerformance } from './lib/memoryPerformance.ts'
import { computeAndReportBundleSizes } from './lib/bundleSizes.ts'
import { computeAndReportCpuPerformance } from './lib/cpuPerformance.ts'

runMain(async () => {
  const pr = await fetchPR(LOCAL_BRANCH!)
  if (!pr) {
    throw new Error('No pull requests found for the branch')
  }
  const prComment = new PrComment(pr.number)
  const lastCommonCommit = getLastCommonCommit(pr.base.ref)

  printLog('Bundle sizes...')
  await computeAndReportBundleSizes(lastCommonCommit, prComment)

  printLog('Memory performance...')
  await computeAndReportMemoryPerformance(lastCommonCommit, prComment)

  printLog('CPU performance...')
  await computeAndReportCpuPerformance(lastCommonCommit, prComment)
})
