import { printLog, runMain } from '../lib/executionUtils.ts'
import { fetchPR, LOCAL_BRANCH, getLastCommonCommit } from '../lib/gitUtils.ts'
import { Pr } from './lib/reportAsAPrComment.ts'
import { computeAndReportMemoryPerformance } from './lib/memoryPerformance.ts'
import { computeAndReportBundleSizes } from './lib/bundleSizes.ts'
import { computeAndReportCpuPerformance } from './lib/cpuPerformance.ts'

runMain(async () => {
  const githubPr = await fetchPR(LOCAL_BRANCH!)
  let pr: Pr | undefined
  if (!githubPr) {
    printLog('No pull requests found for the branch, reporting only (normal for main)')
  } else {
    const lastCommonCommit = getLastCommonCommit(githubPr.base.ref)
    pr = new Pr(githubPr.number, lastCommonCommit)
  }

  printLog('Bundle sizes...')
  await computeAndReportBundleSizes(pr)

  printLog('Memory performance...')
  await computeAndReportMemoryPerformance(pr)

  printLog('CPU performance...')
  await computeAndReportCpuPerformance(pr)
})
