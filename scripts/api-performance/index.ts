import { printLog, runMain } from '../lib/executionUtils.ts'
import { runCpuPerformanceTest } from './lib/cpuPerformance.ts'
import { runMemoryPerformanceTest } from './lib/memoryPerformance.ts'

runMain(async () => {
  printLog('CPU performance...')
  await runCpuPerformanceTest()

  printLog('Memory performance...')
  await runMemoryPerformanceTest()
})
