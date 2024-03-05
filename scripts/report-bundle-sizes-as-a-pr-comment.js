const { command } = require('./lib/command')
const { runMain, timeout } = require('./lib/execution-utils')
const { getOrg2ApiKey, getGithubAccessToken, getOrg2AppKey } = require('./lib/secrets')

const PR_COMMENT_HEADER = 'Bundles Sizes Evolution'
const BASE_BRANCH = process.env.MAIN_BRANCH
const LOCAL_BRANCH = process.env.CI_COMMIT_REF_NAME
const PR_COMMENTER_AUTH_TOKEN = command`authanywhere`.run().split(' ')[2].trim()
const GITHUB_TOKEN = getGithubAccessToken()
const ONE_DAY_IN_SECOND = 24 * 60 * 60
const TIMEOUT_DURATION_MS = 5000

runMain(async () => {
  const lastCommonCommit = getLastCommonCommit(BASE_BRANCH, LOCAL_BRANCH)
  const latestLocalCommit = process.env.CI_COMMIT_SHORT_SHA
  const prs = await getPRs(LOCAL_BRANCH)
  if (prs.length === 0) {
    throw new Error('No pull requests found for the branch')
  }
  if (prs.length > 1) {
    throw new Error('More than one PR found for the branch')
  }
  const mainBranchBundleSizes = await fetchAllPackagesBundleSize(loadQuery(lastCommonCommit))
  const currentBranchBundleSizes = await fetchAllPackagesBundleSize(loadQuery(latestLocalCommit))
  const difference = compare(mainBranchBundleSizes, currentBranchBundleSizes)
  const commentId = await retrieveExistingCommentId(prs[0].number)
  await updateOrAddComment(difference, mainBranchBundleSizes, currentBranchBundleSizes, prs[0].number, commentId)
})

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

async function getPRs(localBranch) {
  const response = await fetch(`https://api.github.com/repos/DataDog/browser-sdk/pulls?head=DataDog:${localBranch}`, {
    method: 'GET',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
    },
  })
  if (!response.ok) {
    throw new Error(`HTTP Error Response: ${response.status} ${response.statusText}`)
  }
  return response.body ? response.json() : null
}

function loadQuery(commitSha) {
  return [
    {
      name: 'bundles_sizes_rum',
      queries: `avg:bundle_sizes.rum{commit:${commitSha}}`,
    },
    {
      name: 'bundles_sizes_logs',
      queries: `avg:bundle_sizes.logs{commit:${commitSha}}`,
    },
    {
      name: 'bundles_sizes_rum_slim',
      queries: `avg:bundle_sizes.rum_slim{commit:${commitSha}}`,
    },
    {
      name: 'bundles_sizes_worker',
      queries: `avg:bundle_sizes.worker{commit:${commitSha}}`,
    },
  ]
}

function fetchAllPackagesBundleSize(bundleSizeQueries) {
  return Promise.all(bundleSizeQueries.map((budget) => fetchBundleSizesMetrics(budget)))
}

async function fetchBundleSizesMetrics(budget, retries = 4) {
  const now = Math.floor(Date.now() / 1000)
  const date = now - 30 * ONE_DAY_IN_SECOND
  for (let i = 0; i < retries; i++) {
    const response = await fetch(
      `https://api.datadoghq.com/api/v1/query?query=${budget.queries}&from=${date}&to=${now}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': getOrg2ApiKey(),
          'DD-APPLICATION-KEY': getOrg2AppKey(),
        },
      }
    )
    if (!response.ok) {
      throw new Error(`HTTP Error Response: ${response.status} ${response.statusText}`)
    }
    const data = await response.json()
    if (data.series && data.series.length > 0 && data.series[0].pointlist && data.series[0].pointlist.length > 0) {
      return {
        name: budget.name,
        size: data.series[0].pointlist[0][1],
      }
    }
    await timeout(TIMEOUT_DURATION_MS)
  }
  return {
    name: budget.name,
    size: null,
  }
}

function compare(resultsBaseQuery, resultsLocalQuery) {
  return resultsBaseQuery.map((baseResult, index) => {
    const localResult = resultsLocalQuery[index]
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
  const targetComment = comments.filter((comment) => comment.body.startsWith('## Bundles Sizes Evolution'))[0]
  if (targetComment !== undefined) {
    return targetComment.id
  }
}
async function updateOrAddComment(difference, resultsBaseQuery, resultsLocalQuery, prNumber, commentId) {
  const message = createMessage(difference, resultsBaseQuery, resultsLocalQuery)
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

function createMessage(difference, resultsBaseQuery, resultsLocalQuery) {
  let message = '| 📦 Bundle | Base Size | Local Size | 𝚫% |\n| --- | --- | --- | --- |\n'
  difference.forEach((diff, index) => {
    const baseSize = formatSize(resultsBaseQuery[index].size)
    const localSize = formatSize(resultsLocalQuery[index].size)
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

function formatSize(size) {
  return `<code title="${size}" style="background: none;">${(size / 1024).toFixed(2)} kB</code>`
}
