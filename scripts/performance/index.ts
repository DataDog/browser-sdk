import { runMain } from '../lib/executionUtils'
import { calculateBundleSizes } from '../lib/computeBundleSize'
import { reportAsPrComment } from './lib/reportAsAPrComment'
import { reportToDatadog } from './lib/reportToDatadog'
import { computeCpuPerformance } from './lib/computeCpuPerformance'
import { computeMemoryPerformance } from './lib/computeMemoryPerformance'

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
