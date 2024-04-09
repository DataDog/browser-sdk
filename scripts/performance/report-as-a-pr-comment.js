const { command } = require('../lib/command')
const { fetchHandlingError } = require('../lib/execution-utils')
const { getOrg2ApiKey, getOrg2AppKey } = require('../lib/secrets')
const { LOCAL_BRANCH, BASE_BRANCH, GITHUB_TOKEN, getLastCommonCommit, fetchPR } = require('../lib/git-utils')
const PR_COMMENT_HEADER = 'Bundles Sizes Evolution'
const PR_COMMENTER_AUTH_TOKEN = command`authanywhere`.run().split(' ')[2].trim()
const ONE_DAY_IN_SECOND = 24 * 60 * 60
// The value is set to 5% as it's around 10 times the average value for small PRs.
const SIZE_INCREASE_THRESHOLD = 5
const ACTION_NAMES = [
  'adderror',
  'addaction',
  'logmessage',
  'startview',
  'startstopsessionreplayrecording',
  'addtiming',
  'addglobalcontext',
]

async function reportAsPrComment(localBundleSizes) {
  const lastCommonCommit = getLastCommonCommit(BASE_BRANCH, LOCAL_BRANCH)
  const pr = await fetchPR(LOCAL_BRANCH)
  if (!pr) {
    console.log('No pull requests found for the branch')
    return
  }
  const packageNames = Object.keys(localBundleSizes)
  const mainBranchBundleSizes = await fetchMetrics('bundle', packageNames, lastCommonCommit)
  const cpuBasePerformance = await fetchMetrics('cpu', ACTION_NAMES, lastCommonCommit)
  const cpuLocalPerformance = await fetchMetrics('cpu', ACTION_NAMES, process.env.CI_COMMIT_SHORT_SHA)
  const differenceBundle = compare(mainBranchBundleSizes, localBundleSizes)
  const differenceCpu = compare(cpuBasePerformance, cpuLocalPerformance)
  const commentId = await retrieveExistingCommentId(pr.number)
  await updateOrAddComment(
    differenceBundle,
    differenceCpu,
    mainBranchBundleSizes,
    localBundleSizes,
    cpuBasePerformance,
    cpuLocalPerformance,
    pr.number,
    commentId
  )
}

function fetchMetrics(type, names, commitId) {
  return Promise.all(names.map((name) => fetchMetric(type, name, commitId)))
}

async function fetchMetric(type, name, commitId) {
  const now = Math.floor(Date.now() / 1000)
  const date = now - 30 * ONE_DAY_IN_SECOND
  let query = ''

  if (type === 'bundle') {
    query = `avg:bundle_sizes.${name}{commit:${commitId}}&from=${date}&to=${now}`
  } else if (type === 'cpu') {
    query = `avg:cpu.sdk.${name}.performance.average{commitid:${commitId}}&from=${date}&to=${now}`
  }

  const response = await fetchHandlingError(`https://api.datadoghq.com/api/v1/query?query=${query}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'DD-API-KEY': getOrg2ApiKey(),
      'DD-APPLICATION-KEY': getOrg2AppKey(),
    },
  })
  const data = await response.json()
  if (data.series && data.series.length > 0 && data.series[0].pointlist && data.series[0].pointlist.length > 0) {
    return {
      name,
      value: data.series[0].pointlist[0][1],
    }
  }
  return {
    name,
    value: null,
  }
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
async function updateOrAddComment(
  differenceBundle,
  differenceCpu,
  baseBundleSizes,
  localBundleSizes,
  cpuBasePerformance,
  cpuLocalPerformance,
  prNumber,
  commentId
) {
  const message = createMessage(
    differenceBundle,
    differenceCpu,
    baseBundleSizes,
    localBundleSizes,
    cpuBasePerformance,
    cpuLocalPerformance
  )
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
  differenceCpu,
  baseBundleSizes,
  localBundleSizes,
  cpuBasePerformance,
  cpuLocalPerformance
) {
  let message =
    '| 📦 Bundle Name| Base Size | Local Size | 𝚫 | 𝚫% | Status |\n| --- | --- | --- | --- | --- | :---: |\n'
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

  if (highIncreaseDetected) {
    message += `\n⚠️ The increase is particularly high and exceeds ${SIZE_INCREASE_THRESHOLD}%. Please check the changes.`
  }
  message += '\n\n<details>\n<summary>🚀 CPU Performance</summary>\n\n\n'
  message +=
    '| Action Name | Base Average Cpu Time (ms) | Local Average Cpu Time (ms) | 𝚫 |\n| --- | --- | --- | --- |\n'
  cpuBasePerformance.forEach((basePerf, index) => {
    const localPerf = cpuLocalPerformance[index]
    const diffPerf = differenceCpu[index]
    const baseValue = basePerf.value !== null ? basePerf.value.toFixed(3) : 'N/A'
    const localValue = localPerf.value !== null ? localPerf.value.toFixed(3) : 'N/A'
    const diffValue = diffPerf.change !== null ? diffPerf.change.toFixed(3) : 'N/A'
    message += `| ${formatBundleName(basePerf.name)} | ${baseValue} | ${localValue} | ${diffValue} |\n`
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

function formatSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  return `${(bytes / 1024).toFixed(2)} KiB`
}

module.exports = {
  reportAsPrComment,
}
