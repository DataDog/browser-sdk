import { formatPercentage, formatSize } from '../../lib/executionUtils.ts'
import { calculateBundleSizes } from '../../lib/computeBundleSize.ts'
import type { PerformanceMetric } from './fetchPerformanceMetrics.ts'
import { fetchPerformanceMetrics } from './fetchPerformanceMetrics.ts'
import { markdownArray, type Pr } from './reportAsAPrComment.ts'
import { reportToDatadog } from './reportToDatadog.ts'

// The value is set to 5% as it's around 10 times the average value for small PRs.
const SIZE_INCREASE_THRESHOLD = 5

export async function computeAndReportBundleSizes(pr?: Pr) {
  const localBundleSizes = extractUncompressedBundleSizes(calculateBundleSizes())
  await reportToDatadog({
    message: 'Browser SDK bundles sizes',
    bundle_sizes: Object.fromEntries(localBundleSizes.map(({ name, value }) => [name, value])),
  })
  if (!pr) {
    return
  }
  let baseBundleSizes: PerformanceMetric[]
  try {
    baseBundleSizes = await fetchPerformanceMetrics(
      'bundle',
      localBundleSizes.map((bundleSize) => bundleSize.name),
      pr.lastCommonCommit
    )
  } catch (e) {
    await pr.setBundleSizes('Error fetching base bundle sizes')
    throw e
  }

  await pr.setBundleSizes(
    formatBundleSizes({
      baseBundleSizes,
      localBundleSizes,
    })
  )
}

function extractUncompressedBundleSizes(bundleSizes: Record<string, { uncompressed: number }>): PerformanceMetric[] {
  return Object.entries(bundleSizes).map(([key, size]) => ({ name: key, value: size.uncompressed }))
}

export function formatBundleSizes({
  baseBundleSizes,
  localBundleSizes,
}: {
  baseBundleSizes: PerformanceMetric[]
  localBundleSizes: PerformanceMetric[]
}) {
  let highIncreaseDetected = false
  let message = markdownArray({
    headers: [
      { label: '📦 Bundle Name', align: 'left' },
      { label: 'Base Size', align: 'right' },
      { label: 'Local Size', align: 'right' },
      { label: '𝚫', align: 'right' },
      { label: '𝚫%', align: 'right' },
      { label: 'Status', align: 'center' },
    ],
    rows: localBundleSizes.map((localBundleSize) => {
      const baseBundleSize = baseBundleSizes.find((baseBundleSize) => baseBundleSize.name === localBundleSize.name)

      if (!baseBundleSize) {
        return [formatBundleName(localBundleSize.name), 'N/A', formatSize(localBundleSize.value), 'N/A', 'N/A', 'N/A']
      }

      const percentageChange = (localBundleSize.value - baseBundleSize.value) / baseBundleSize.value

      let status = '✅'
      if (percentageChange > SIZE_INCREASE_THRESHOLD) {
        status = '⚠️'
        highIncreaseDetected = true
      }
      return [
        formatBundleName(localBundleSize.name),
        formatSize(baseBundleSize.value),
        formatSize(localBundleSize.value),
        formatSize(localBundleSize.value - baseBundleSize.value, { includeSign: true }),
        formatPercentage(percentageChange, { includeSign: true }),
        status,
      ]
    }),
  })

  if (highIncreaseDetected) {
    message += `\n⚠️ The increase is particularly high and exceeds ${SIZE_INCREASE_THRESHOLD}%. Please check the changes.`
  }

  return message
}

function formatBundleName(bundleName: string): string {
  return bundleName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
