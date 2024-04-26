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
  const actionNames = memoryLocalPerformance.map((obj) => formatActionName(obj.sdkTask))
  const baseBundleSizes = await fetchPerformanceMetrics('bundle', packageNames, lastCommonCommit)
  const cpuBasePerformance = await fetchPerformanceMetrics('cpu', actionNames, lastCommonCommit)
  const cpuLocalPerformance = await fetchPerformanceMetrics('cpu', actionNames, LOCAL_COMMIT_SHA)
  const memoryBasePerformance = await fetchPerformanceMetrics('memory', actionNames, lastCommonCommit)
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
  let message =
    '|📦 Bundle Name | Base Size | Local Size | 𝚫 | 𝚫% | Status |\n| --- | --- | --- | --- | --- | :---: |\n'
  let highIncreaseDetected = false
  differenceBundle.forEach((diff, index) => {
    const baseSize = formatSize(baseBundleSizes[index].value)
    const localSize = formatSize(localBundleSizes[diff.name])
    const diffSize = formatSize(diff.change)
    const sign = diff.percentageChange > 0 ? '+' : ''
    let status = '✅'
    if (diff.percentageChange > SIZE_INCREASE_THRESHOLD) {
      status = '⚠️'
      highIncreaseDetected = true
    }
    message += `| ${formatBundleName(diff.name)} | ${baseSize} | ${localSize} | ${diffSize} | ${sign}${diff.percentageChange}% | ${status} |\n`
  })
  message += '</details>\n\n'

  if (highIncreaseDetected) {
    message += `\n⚠️ The increase is particularly high and exceeds ${SIZE_INCREASE_THRESHOLD}%. Please check the changes.`
  }

  message += '\n\n<details>\n<summary>🚀 CPU Performance</summary>\n\n'
  message +=
    '| Action Name | Base Average Cpu Time (ms) | Local Average Cpu Time (ms) | 𝚫 |\n| --- | --- | --- | --- |\n'
  cpuBasePerformance.forEach((cpuActionPerformance, index) => {
    const localCpuPerf = cpuLocalPerformance[index]
    const diffCpuPerf = differenceCpu[index]
    const baseCpuTaskValue = cpuActionPerformance.value !== null ? cpuActionPerformance.value.toFixed(3) : 'N/A'
    const localCpuTaskValue = localCpuPerf.value !== null ? localCpuPerf.value.toFixed(3) : 'N/A'
    const diffCpuTaskValue = diffCpuPerf.change !== null ? diffCpuPerf.change.toFixed(3) : 'N/A'
    message += `| ${cpuActionPerformance.name} | ${baseCpuTaskValue} | ${localCpuTaskValue} | ${diffCpuTaskValue} |\n`
  })
  message += '\n</details>\n'

  message += '\n\n<details>\n<summary>🧠 Memory Performance</summary>\n\n'
  message +=
    '| Action Name | Base Consumption Memory (bytes) | Local Consumption Memory (bytes) | 𝚫 |\n| --- | --- | --- | --- |\n'
  differenceMemory.forEach((memoryActionPerformance, index) => {
    const baseMemoryPerf = memoryBasePerformance[index]
    const localMemoryPerf = memoryLocalPerformance.find(
      (perf) => formatActionName(perf.sdkTask) === memoryActionPerformance.name
    )
    const baseMemoryTaskValue = baseMemoryPerf.value !== null ? baseMemoryPerf.value : 'N/A'
    const localMemoryTaskValue =
      localMemoryPerf && localMemoryPerf.sdkMemoryBytes !== null ? localMemoryPerf.sdkMemoryBytes : 'N/A'
    const diffMemoryTaskValue = memoryActionPerformance.change !== null ? memoryActionPerformance.change : 'N/A'
    message += `| ${memoryActionPerformance.name} | ${baseMemoryTaskValue} | ${localMemoryTaskValue} | ${diffMemoryTaskValue} |\n`
  })
  message += '\n</details>\n'

  return message
}

function formatBundleName(bundleName) {
  return bundleName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatActionName(taskName) {
  return taskName
    .replace('RUM - ', '')
    .replace('Logs - ', '')
    .replace(/ - /g, '_')
    .replace(/ /g, '')
    .replace(/\//g, '')
    .toLowerCase()
}

function formatSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  return `${(bytes / 1024).toFixed(2)} KiB`
}

module.exports = {
  LOCAL_COMMIT_SHA,
  reportAsPrComment,
}
