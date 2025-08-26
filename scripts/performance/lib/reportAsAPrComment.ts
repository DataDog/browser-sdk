import { command } from '../../lib/command.ts'
import { formatSize } from '../../lib/computeBundleSize.ts'
import { fetchHandlingError } from '../../lib/executionUtils.ts'
import { LOCAL_BRANCH, getLastCommonCommit, fetchPR, getPrComments } from '../../lib/gitUtils.ts'
import { fetchPerformanceMetrics } from './fetchPerformanceMetrics.ts'

const PR_COMMENT_HEADER = 'Bundles Sizes Evolution'
const PR_COMMENTER_AUTH_TOKEN = command`authanywhere --raw`.run()
// The value is set to 5% as it's around 10 times the average value for small PRs.
const SIZE_INCREASE_THRESHOLD = 5
export const LOCAL_COMMIT_SHA = process.env.CI_COMMIT_SHORT_SHA

interface BundleSizes {
  [key: string]: number
}

interface MemoryPerformance {
  testProperty: string
  sdkMemoryBytes: number
  sdkMemoryPercentage: number
}

interface PerformanceMetric {
  name: string
  value: number | null
}

interface PerformanceDifference {
  name: string
  change: number | null
  percentageChange: string | number | null
}

export async function reportAsPrComment(
  localBundleSizes: BundleSizes,
  memoryLocalPerformance: MemoryPerformance[]
): Promise<void> {
  if (!LOCAL_BRANCH) {
    console.log('LOCAL_BRANCH is not defined')
    return
  }

  const pr = await fetchPR(LOCAL_BRANCH)
  if (!pr) {
    console.log('No pull requests found for the branch')
    return
  }
  const lastCommonCommit = getLastCommonCommit(pr.base.ref)
  const packageNames = Object.keys(localBundleSizes)
  const testNames = memoryLocalPerformance.map((obj) => obj.testProperty)
  const baseBundleSizes = await fetchPerformanceMetrics('bundle', packageNames, lastCommonCommit)
  const cpuBasePerformance = await fetchPerformanceMetrics('cpu', testNames, lastCommonCommit)
  const cpuLocalPerformance = await fetchPerformanceMetrics('cpu', testNames, LOCAL_COMMIT_SHA || '')
  const memoryBasePerformance = await fetchPerformanceMetrics('memory', testNames, lastCommonCommit)
  const differenceBundle = compare(baseBundleSizes, localBundleSizes)
  const differenceCpu = compare(cpuBasePerformance, cpuLocalPerformance)
  const commentId = await retrieveExistingCommentId(pr.number)
  const message = createMessage(
    differenceBundle,
    differenceCpu,
    baseBundleSizes,
    localBundleSizes,
    memoryBasePerformance,
    memoryLocalPerformance,
    cpuBasePerformance,
    cpuLocalPerformance,
    pr.number
  )
  await updateOrAddComment(message, pr.number, commentId)
}

function compare(
  baseResults: PerformanceMetric[],
  localResults: BundleSizes | PerformanceMetric[]
): PerformanceDifference[] {
  return baseResults.map((baseResult) => {
    let localResult: number | undefined | null = null

    if (Array.isArray(localResults)) {
      const localResultObj = localResults.find((result) => result.name === baseResult.name)
      localResult = localResultObj ? localResultObj.value : null
    } else {
      localResult = localResults[baseResult.name]
    }

    let change = null
    let percentageChange: string | number | null = null

    if (baseResult.value && localResult) {
      change = localResult - baseResult.value
      percentageChange = ((change / baseResult.value) * 100).toFixed(2)
    } else if (localResult) {
      change = localResult
      percentageChange = 'N/A'
    }

    return {
      name: baseResult.name,
      change,
      percentageChange,
    }
  })
}

async function retrieveExistingCommentId(prNumber: number): Promise<number | undefined> {
  const comments = await getPrComments(prNumber)

  const targetComment = comments.find((comment) => comment.body.startsWith(`## ${PR_COMMENT_HEADER}`))
  if (targetComment !== undefined) {
    return targetComment.id
  }
}

async function updateOrAddComment(message: string, prNumber: number, commentId: number | undefined): Promise<void> {
  const method = commentId ? 'PATCH' : 'POST'
  const payload = {
    pr_url: `https://github.com/DataDog/browser-sdk/pull/${prNumber}`,
    message,
    header: PR_COMMENT_HEADER,
    org: 'DataDog',
    repo: 'browser-sdk',
  }
  await fetchHandlingError('https://pr-commenter.us1.ddbuild.io/internal/cit/pr-comment', {
    method,
    headers: {
      Authorization: `Bearer ${PR_COMMENTER_AUTH_TOKEN}`,
    },
    body: JSON.stringify(payload),
  })
}

function createMessage(
  differenceBundle: PerformanceDifference[],
  differenceCpu: PerformanceDifference[],
  baseBundleSizes: PerformanceMetric[],
  localBundleSizes: BundleSizes,
  memoryBasePerformance: PerformanceMetric[],
  memoryLocalPerformance: MemoryPerformance[],
  cpuBasePerformance: PerformanceMetric[],
  cpuLocalPerformance: PerformanceMetric[],
  prNumber: number
): string {
  let highIncreaseDetected = false
  const bundleRows = differenceBundle.map((diff, index) => {
    const baseSize = formatSize(baseBundleSizes[index].value)
    const localSize = formatSize(localBundleSizes[diff.name])
    const diffSize = formatSize(diff.change)
    const sign = typeof diff.percentageChange === 'number' && diff.percentageChange > 0 ? '+' : ''
    let status = '✅'
    if (typeof diff.percentageChange === 'number' && diff.percentageChange > SIZE_INCREASE_THRESHOLD) {
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

  const cpuRows = cpuBasePerformance.map((cpuTestPerformance, index) => {
    const localCpuPerf = cpuLocalPerformance[index]
    const diffCpuPerf = differenceCpu[index]
    const baseCpuTestValue = cpuTestPerformance.value !== null ? cpuTestPerformance.value.toFixed(3) : 'N/A'
    const localCpuTestValue = localCpuPerf.value !== null ? localCpuPerf.value.toFixed(3) : 'N/A'
    const diffCpuTestValue = diffCpuPerf.change !== null ? diffCpuPerf.change.toFixed(3) : 'N/A'
    return [cpuTestPerformance.name, baseCpuTestValue, localCpuTestValue, diffCpuTestValue]
  })

  message += '<details>\n<summary>🚀 CPU Performance</summary>\n\n'
  message += markdownArray({
    headers: ['Action Name', 'Base Average Cpu Time (ms)', 'Local Average Cpu Time (ms)', '𝚫'],
    rows: cpuRows,
  })
  message += '\n</details>\n\n'

  const memoryRows = memoryBasePerformance.map((baseMemoryPerf, index) => {
    const memoryTestPerformance = memoryLocalPerformance[index]
    const baseMemoryTestValue = baseMemoryPerf.value
    const localMemoryTestValue = memoryTestPerformance.sdkMemoryBytes
    return [
      memoryTestPerformance.testProperty,
      formatSize(baseMemoryTestValue),
      formatSize(localMemoryTestValue),
      typeof localMemoryTestValue === 'number' && typeof baseMemoryTestValue === 'number'
        ? formatSize(localMemoryTestValue - baseMemoryTestValue)
        : 'N/A',
    ]
  })

  message += '<details>\n<summary>🧠 Memory Performance</summary>\n\n'
  message += markdownArray({
    headers: ['Action Name', 'Base Consumption Memory (bytes)', 'Local Consumption Memory (bytes)', '𝚫 (bytes)'],
    rows: memoryRows,
  })
  message += '\n</details>\n\n'

  message += `🔗 [RealWorld](https://datadoghq.dev/browser-sdk-test-playground/realworld-scenario/?prNumber=${prNumber})\n\n`

  return message
}

function formatBundleName(bundleName: string): string {
  return bundleName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

interface MarkdownArrayOptions {
  headers: string[]
  rows: string[][]
}

function markdownArray({ headers, rows }: MarkdownArrayOptions): string {
  let markdown = `| ${headers.join(' | ')} |\n| ${new Array(headers.length).fill('---').join(' | ')} |\n`
  rows.forEach((row) => {
    markdown += `| ${row.join(' | ')} |\n`
  })
  return markdown
}
