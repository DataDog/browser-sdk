import { runMain } from '../lib/executionUtils.ts'
import { calculateBundleSizes } from '../lib/computeBundleSize.ts'
import { reportAsPrComment } from './lib/reportAsAPrComment.ts'
import { reportToDatadog } from './lib/reportToDatadog.ts'
import { computeCpuPerformance } from './lib/computeCpuPerformance.ts'
import { computeMemoryPerformance } from './lib/computeMemoryPerformance.ts'

interface UncompressedBundleSizes {
  [key: string]: number
}

runMain(async () => {
  const localBundleSizes = extractUncompressedBundleSizes(calculateBundleSizes())
  const localMemoryPerformance = await computeMemoryPerformance()
  await computeCpuPerformance()
  await reportToDatadog(localMemoryPerformance, 'memoryPerformance')
  await reportToDatadog(localBundleSizes, 'bundleSizes')
  await reportAsPrComment(localBundleSizes, localMemoryPerformance)
})

// keep compatibility with the logs and PR comment format
function extractUncompressedBundleSizes(
  bundleSizes: Record<string, { uncompressed: number }>
): UncompressedBundleSizes {
  return Object.fromEntries(Object.entries(bundleSizes).map(([key, size]) => [key, size.uncompressed]))
}
