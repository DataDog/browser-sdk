const { command } = require('../lib/command')
const { fetchHandlingError } = require('../lib/execution-utils')
const { LOCAL_BRANCH, BASE_BRANCH, GITHUB_TOKEN, getLastCommonCommit, fetchPR } = require('../lib/git-utils')
const { fetchPerformanceMetrics } = require('./fetch-performance-metrics')
const PR_COMMENT_HEADER = 'Bundles Sizes Evolution'
const PR_COMMENTER_AUTH_TOKEN = command`authanywhere`.run().split(' ')[2].trim()
// The value is set to 5% as it's around 10 times the average value for small PRs.
const SIZE_INCREASE_THRESHOLD = 5
const LOCAL_COMMIT_SHA = process.env.CI_COMMIT_SHORT_SHA

async function reportAsPrComment(localBundleSizes, memoryLocalPerformance) {
  const lastCommonCommit = getLastCommonCommit(BASE_BRANCH, LOCAL_BRANCH)
  const pr = await fetchPR(LOCAL_BRANCH)
  if (!pr) {
    console.log('No pull requests found for the branch')
    return
  }
  const packageNames = Object.keys(localBundleSizes)
  const testNames = memoryLocalPerformance.map((obj) => obj.testProperty)
  const baseBundleSizes = await fetchPerformanceMetrics('bundle', packageNames, lastCommonCommit)
  const cpuBasePerformance = await fetchPerformanceMetrics('cpu', testNames, lastCommonCommit)
  const cpuLocalPerformance = await fetchPerformanceMetrics('cpu', testNames, LOCAL_COMMIT_SHA)
  const memoryBasePerformance = await fetchPerformanceMetrics('memory', testNames, lastCommonCommit)
  const differenceMemory = compare(memoryBasePerformance, memoryLocalPerformance)
  const differenceBundle = compare(baseBundleSizes, localBundleSizes)
  const differenceCpu = compare(cpuBasePerformance, cpuLocalPerformance)
  const commentId = await retrieveExistingCommentId(pr.number)
  const message = createMessage(
    differenceBundle,
    differenceMemory,
    differenceCpu,
    baseBundleSizes,
    localBundleSizes,
    memoryBasePerformance,
    memoryLocalPerformance,
    cpuBasePerformance,
    cpuLocalPerformance
  )
  await updateOrAddComment(message, pr.number, commentId)
}

function compare(baseResults, localResults) {
  return baseResults.map((baseResult) => {
    let localResult = null

    if (Array.isArray(localResults)) {
      const localResultObj = localResults.find((result) => result.name === baseResult.name)
      localResult = localResultObj ? localResultObj.value : null
    } else {
      localResult = localResults[baseResult.name]
    }

    let change = null
    let percentageChange = null

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

async function retrieveExistingCommentId(prNumber) {
  const response = await fetchHandlingError(
    `https://api.github.com/repos/DataDog/browser-sdk/issues/${prNumber}/comments`,
    {
      method: 'GET',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
      },
    }
  )
  const comments = await response.json()
  const targetComment = comments.find((comment) => comment.body.startsWith(`## ${PR_COMMENT_HEADER}`))
  if (targetComment !== undefined) {
    return targetComment.id
  }
}
async function updateOrAddComment(message, prNumber, commentId) {
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
  differenceBundle,
  differenceMemory,
  differenceCpu,
  baseBundleSizes,
  localBundleSizes,
  memoryBasePerformance,
  memoryLocalPerformance,
  cpuBasePerformance,
  cpuLocalPerformance
) {
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

  const memoryRows = differenceMemory.map((memoryTestPerformance, index) => {
    const baseMemoryPerf = memoryBasePerformance[index]
    const localMemoryPerf = memoryLocalPerformance.find((perf) => perf.testProperty === memoryTestPerformance.name)
    const baseMemoryTestValue = baseMemoryPerf.value !== null ? baseMemoryPerf.value : 'N/A'
    const localMemoryTestValue =
      localMemoryPerf && localMemoryPerf.sdkMemoryBytes !== null ? localMemoryPerf.sdkMemoryBytes : 'N/A'
    return [
      memoryTestPerformance.name,
      formatSize(baseMemoryTestValue),
      formatSize(localMemoryTestValue),
      formatSize(Math.abs(baseMemoryTestValue - localMemoryTestValue)),
    ]
  })

  message += '<details>\n<summary>🧠 Memory Performance</summary>\n\n'
  message += markdownArray({
    headers: ['Action Name', 'Base Consumption Memory (bytes)', 'Local Consumption Memory (bytes)', '𝚫'],
    rows: memoryRows,
  })
  message += '\n</details>\n\n'

  return message
}

function formatBundleName(bundleName) {
  return bundleName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatSize(bytes) {
  if (bytes < 1024) {
    return `${Math.floor(bytes)} B`
  }

  return `${(bytes / 1024).toFixed(2)} KiB`
}

function markdownArray({ headers, rows }) {
  let markdown = `| ${headers.join(' | ')} |\n| ${new Array(headers.length).fill('---').join(' | ')} |\n`
  rows.forEach((row) => {
    markdown += `| ${row.join(' | ')} |\n`
  })
  return markdown
}

module.exports = {
  LOCAL_COMMIT_SHA,
  reportAsPrComment,
}
