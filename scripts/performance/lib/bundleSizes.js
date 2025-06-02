const { formatSize } = require('../../lib/computeBundleSize')
const { printError } = require('../../lib/executionUtils')
const { calculateBundleSizes } = require('../../lib/computeBundleSize')
const { compare, markdownArray } = require('./formatUtils')
const { fetchPerformanceMetrics } = require('./fetchPerformanceMetrics')
const { reportToDatadog } = require('./reportToDatadog')

// The value is set to 5% as it's around 10 times the average value for small PRs.
const SIZE_INCREASE_THRESHOLD = 5

exports.runBundleSizes = async function ({ lastCommonCommit, prComment }) {
  try {
    const localBundleSizes = extractUncompressedBundleSizes(calculateBundleSizes())
    await reportToDatadog(localBundleSizes, 'bundleSizes')
    const bundleSizesMessage = await formatBundleSizes(localBundleSizes, lastCommonCommit)
    prComment.setBundleSizesMessage(bundleSizesMessage)
  } catch (error) {
    printError('Error while computing bundle sizes:', error)
    prComment.setBundleSizesMessage('❌ Failed to compute bundle sizes.')
    process.exitCode = 1
  }
}

// keep compatibility with the logs and PR comment format
function extractUncompressedBundleSizes(bundleSizes) {
  return Object.fromEntries(Object.entries(bundleSizes).map(([key, size]) => [key, size.uncompressed]))
}

async function formatBundleSizes(localBundleSizes, lastCommonCommit) {
  const packageNames = Object.keys(localBundleSizes)
  const baseBundleSizes = await fetchPerformanceMetrics('bundle', packageNames, lastCommonCommit)
  const differenceBundle = compare(baseBundleSizes, localBundleSizes)

  let highIncreaseDetected = false
  const bundleRows = differenceBundle.map((diff, index) => {
    const baseSize = formatSize(baseBundleSizes[index].value)
    const localSize = formatSize(localBundleSizes[diff.name])
    const diffSize = formatSize(diff.change)
    const sign = diff.percentageChange > 0 ? '+' : ''
    let status = '✅'
    if (diff.percentageChange > SIZE_INCREASE_THRESHOLD) {
      status = '⚠️'
      highIncreaseDetected = true
    }
    return [formatBundleName(diff.name), baseSize, localSize, diffSize, `${sign}${diff.percentageChange}%`, status]
  })

  let message = markdownArray({
    headers: ['📦 Bundle Name', 'Base Size', 'Local Size', '𝚫', '𝚫%', 'Status'],
    rows: bundleRows,
  })

  message += '</details>\n\n'

  if (highIncreaseDetected) {
    message += `\n⚠️ The increase is particularly high and exceeds ${SIZE_INCREASE_THRESHOLD}%. Please check the changes.`
  }

  return message
}

function formatBundleName(bundleName) {
  return bundleName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
