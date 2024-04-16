const { command } = require('../lib/command')
const { fetchHandlingError } = require('../lib/execution-utils')
const { getOrg2ApiKey, getGithubAccessToken, getOrg2AppKey } = require('../lib/secrets')

const PR_COMMENT_HEADER = 'Bundles Sizes Evolution'
const BASE_BRANCH = process.env.MAIN_BRANCH
const LOCAL_BRANCH = process.env.CI_COMMIT_REF_NAME
const PR_COMMENTER_AUTH_TOKEN = command`authanywhere`.run().split(' ')[2].trim()
const GITHUB_TOKEN = getGithubAccessToken()
const ONE_DAY_IN_SECOND = 24 * 60 * 60
// The value is set to 5% as it's around 10 times the average value for small PRs.
const SIZE_INCREASE_THRESHOLD = 5

async function reportBundleSizesAsPrComment(localBundleSizes) {
  const lastCommonCommit = getLastCommonCommit(BASE_BRANCH, LOCAL_BRANCH)
  const pr = await fetchPR(LOCAL_BRANCH)
  if (!pr) {
    console.log('No pull requests found for the branch')
    return
  }
  const packageNames = Object.keys(localBundleSizes)
  const mainBranchBundleSizes = await fetchAllPackagesBaseBundleSize(packageNames, lastCommonCommit)
  const difference = compare(mainBranchBundleSizes, localBundleSizes)
  const commentId = await retrieveExistingCommentId(pr.number)
  await updateOrAddComment(difference, mainBranchBundleSizes, localBundleSizes, pr.number, commentId)
}

function getLastCommonCommit(baseBranch) {
  try {
    command`git fetch --depth=100 origin ${baseBranch}`.run()
    const commandOutput = command`git merge-base origin/${baseBranch} HEAD`.run()
    // SHA commit is truncated to 8 characters as bundle sizes commit are exported in short format to logs for convenience and readability.
    return commandOutput.trim().substring(0, 8)
  } catch (error) {
    throw new Error('Failed to get last common commit', { cause: error })
  }
}

async function fetchPR(localBranch) {
  const response = await fetchHandlingError(
    `https://api.github.com/repos/DataDog/browser-sdk/pulls?head=DataDog:${localBranch}`,
    {
      method: 'GET',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
      },
    }
  )
  const pr = response.body ? await response.json() : null
  if (pr && pr.length > 1) {
    throw new Error('Multiple pull requests found for the branch')
  }
  return pr ? pr[0] : null
}

function fetchAllPackagesBaseBundleSize(packageNames, commitSha) {
  return Promise.all(packageNames.map((packageName) => fetchBundleSizesMetric(packageName, commitSha)))
}

async function fetchBundleSizesMetric(packageName, commitSha) {
  const now = Math.floor(Date.now() / 1000)
  const date = now - 30 * ONE_DAY_IN_SECOND
  const query = `avg:bundle_sizes.${packageName}{commit:${commitSha}}&from=${date}&to=${now}`

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
      name: packageName,
      size: data.series[0].pointlist[0][1],
    }
  }
  return {
    name: packageName,
    size: null,
  }
}

function compare(resultsBaseQuery, localBundleSizes) {
  return resultsBaseQuery.map((baseResult) => {
    const localSize = localBundleSizes[baseResult.name]
    let change = null
    let percentageChange = null

    if (baseResult.size && localSize) {
      change = localSize - baseResult.size
      percentageChange = ((change / baseResult.size) * 100).toFixed(2)
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
async function updateOrAddComment(difference, resultsBaseQuery, localBundleSizes, prNumber, commentId) {
  const message = createMessage(difference, resultsBaseQuery, localBundleSizes)
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

function createMessage(difference, resultsBaseQuery, localBundleSizes) {
  let message =
    '| 📦 Bundle Name| Base Size | Local Size | 𝚫 | 𝚫% | Status |\n| --- | --- | --- | --- | --- | :---: |\n'
  let highIncreaseDetected = false
  difference.forEach((diff, index) => {
    const baseSize = formatSize(resultsBaseQuery[index].size)
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
  reportBundleSizesAsPrComment,
}
