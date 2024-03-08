const { command } = require('./lib/command')
const { getOrg2ApiKey, getGithubAccessToken, getOrg2AppKey } = require('./lib/secrets')

const PR_COMMENT_HEADER = 'Bundles Sizes Evolution'
const PACKAGES_NAMES = ['rum', 'logs', 'rum_slim', 'worker']
const BASE_BRANCH = process.env.MAIN_BRANCH
const LOCAL_BRANCH = process.env.CI_COMMIT_REF_NAME
const PR_COMMENTER_AUTH_TOKEN = command`authanywhere`.run().split(' ')[2].trim()
const GITHUB_TOKEN = getGithubAccessToken()
const ONE_DAY_IN_SECOND = 24 * 60 * 60

async function reportBundleSizes(localBundleSizes) {
  const lastCommonCommit = getLastCommonCommit(BASE_BRANCH, LOCAL_BRANCH)
  const pr = await fetchPR(LOCAL_BRANCH)
  if (!pr) {
    console.log('No pull requests found for the branch')
    return
  }
  const mainBranchBundleSizes = await fetchAllPackagesBaseBundleSize(lastCommonCommit)
  const difference = compare(mainBranchBundleSizes, localBundleSizes)
  const commentId = await retrieveExistingCommentId(pr.number)
  await updateOrAddComment(difference, mainBranchBundleSizes, localBundleSizes, pr.number, commentId)
}

function getLastCommonCommit(baseBranch) {
  try {
    command`git fetch origin`.run()
    const commandOutput = command`git merge-base origin/${baseBranch} HEAD`.run()
    // SHA commit is truncated to 8 caracters as bundle sizes commit are exported in short format to logs for convenience and readability.
    return commandOutput.trim().substring(0, 8)
  } catch (error) {
    throw new Error('Failed to get last common commit', { cause: error })
  }
}

async function fetchPR(localBranch) {
  const response = await fetch(`https://api.github.com/repos/DataDog/browser-sdk/pulls?head=DataDog:${localBranch}`, {
    method: 'GET',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
    },
  })
  if (!response.ok) {
    throw new Error(`HTTP Error Response: ${response.status} ${response.statusText}`)
  }
  const pr = response.body ? await response.json() : null
  if (pr && pr.length > 1) {
    throw new Error('Multiple pull requests found for the branch')
  }
  return pr ? pr[0] : null
}

function fetchAllPackagesBaseBundleSize(commitSha) {
  return Promise.all(PACKAGES_NAMES.map((packageName) => fetchBundleSizesMetric(packageName, commitSha)))
}

async function fetchBundleSizesMetric(packageName, commitSha) {
  const now = Math.floor(Date.now() / 1000)
  const date = now - 30 * ONE_DAY_IN_SECOND
  const query = `avg:bundle_sizes.${packageName}{commit:${commitSha}}&from=${date}&to=${now}`

  const response = await fetch(`https://api.datadoghq.com/api/v1/query?query=${query}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'DD-API-KEY': getOrg2ApiKey(),
      'DD-APPLICATION-KEY': getOrg2AppKey(),
    },
  })
  if (!response.ok) {
    throw new Error(`HTTP Error Response: ${response.status} ${response.statusText}`)
  }
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
  return resultsBaseQuery.map((baseResult, index) => {
    const localResult = localBundleSizes[index]
    let percentageChange = null

    if (baseResult.size && localResult.size) {
      percentageChange = (((localResult.size - baseResult.size) / baseResult.size) * 100).toFixed(2)
    }
    return {
      name: baseResult.name,
      percentageChange,
    }
  })
}

async function retrieveExistingCommentId(prNumber) {
  const response = await fetch(`https://api.github.com/repos/DataDog/browser-sdk/issues/${prNumber}/comments`, {
    method: 'GET',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
    },
  })
  if (!response.ok) {
    throw new Error(`HTTP Error Response: ${response.status} ${response.statusText}`)
  }
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
  const response = await fetch('https://pr-commenter.us1.ddbuild.io/internal/cit/pr-comment', {
    method,
    headers: {
      Authorization: `Bearer ${PR_COMMENTER_AUTH_TOKEN}`,
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(`HTTP Error Response: ${response.status} ${response.statusText}`)
  }
}

function createMessage(difference, resultsBaseQuery, localBundleSizes) {
  let message = '| 📦 Bundle Name| Base Size | Local Size | 𝚫% |\n| --- | --- | --- | --- |\n'
  difference.forEach((diff, index) => {
    const baseSize = formatSize(resultsBaseQuery[index].size)
    const localSize = formatSize(localBundleSizes[index].size)
    const sign = diff.percentageChange > 0 ? '+' : ''
    message += `| ${formatBundleName(diff.name)} | ${baseSize} | ${localSize} | ${sign}${diff.percentageChange}% |\n`
  })

  return message
}

function formatBundleName(bundleName) {
  return bundleName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatSize(bundleSize) {
  return `${(bundleSize / 1024).toFixed(2)} kB`
}

export { reportBundleSizes }
