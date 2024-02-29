const { execSync } = require('child_process')
const { runMain } = require('./lib/execution-utils')
const { getOrg2ApiKey, getGithubAccessToken, getOrg2AppKey } = require('./lib/secrets')

const header = 'Bundles Sizes Evolution'
const baseBranch = 'main'
const localBranch = process.env.CI_COMMIT_REF_NAME
const githubAuthToken = execSync('authanywhere').toString().split(' ')[2].trim()
const GH_TOKEN = getGithubAccessToken()

const getLastCommonCommit = (branch) => {
  try {
    execSync('git fetch origin')
    const command = `git merge-base origin/${branch} HEAD`
    const commit = execSync(command).toString().trim()
    const shortCommand = `git rev-parse --short ${commit}`
    return execSync(shortCommand).toString().trim()
  } catch (error) {
    console.error(`Error executing command: ${error}`)
    process.exit(1)
  }
}

async function getPRs(branch) {
  const response = await fetch(`https://api.github.com/repos/DataDog/browser-sdk/pulls?head=DataDog:${branch}`, {
    method: 'GET',
    headers: {
      Authorization: `token ${GH_TOKEN}`,
    },
  })
  return response.body ? response.json() : null
}

function createMessage(difference, resultsBaseQuery, resultsLocalQuery) {
  let message = '| Bundle | Base Size | Current Size | Difference |\n| --- | --- | --- | --- |\n'

  difference.forEach((diff, index) => {
    const baseSize = resultsBaseQuery[index].size
    const localSize = resultsLocalQuery[index].size
    const sign = diff.percentageChange > 0 ? '+' : ''
    message += `| ${formatName(diff.name)} | ${baseSize} | ${localSize} | ${sign}${diff.percentageChange}% |\n`
  })

  return message
}

async function updateOrAddComment(difference, resultsBaseQuery, resultsLocalQuery, prNumber, commentId) {
  const message = createMessage(difference, resultsBaseQuery, resultsLocalQuery)
  const method = commentId ? 'PATCH' : 'POST'
  const payload = {
    pr_url: `https://github.com/DataDog/browser-sdk/pull/${prNumber}`,
    message,
    header,
    org: 'DataDog',
    repo: 'browser-sdk',
  }
  await fetch('https://pr-commenter.us1.ddbuild.io/internal/cit/pr-comment', {
    method,
    headers: {
      Authorization: `Bearer ${githubAuthToken}`,
    },
    body: JSON.stringify(payload),
  })
}

async function getCommentId(prNumber) {
  const response = await fetch(`https://api.github.com/repos/DataDog/browser-sdk/issues/${prNumber}/comments`, {
    method: 'GET',
    headers: {
      Authorization: `token ${GH_TOKEN}`,
    },
  })
  const comments = await response.json()
  const targetComment = comments.filter((comment) => comment.body.startsWith('## Bundles Sizes Evolution'))[0]
  if (targetComment !== undefined) {
    return targetComment.id
  }
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

function query(results) {
  const now = Math.floor(Date.now() / 1000)
  const date = now - 30 * 24 * 60 * 60
  return Promise.all(
    results.map(async (budget) => {
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
      const data = await response.json()
      console.log(data)
      return {
        name: budget.name,
        size:
          data.series && data.series.length > 0 && data.series[0].pointlist && data.series[0].pointlist.length > 0
            ? data.series[0].pointlist[0][1]
            : null,
      }
    })
  )
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

function formatName(bundleName) {
  return bundleName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

runMain(async () => {
  const lastCommonCommit = getLastCommonCommit(baseBranch)
  const latestLocalCommit = process.env.CI_COMMIT_SHORT_SHA
  const prs = await getPRs(localBranch)
  console.log(latestLocalCommit)
  console.log(lastCommonCommit)
  if (prs.length === 0) {
    console.log('No pull requests found')
    return
  }
  const resultsBaseQuery = await query(loadQuery(lastCommonCommit))
  const resultsLocalQuery = await query(loadQuery(latestLocalCommit))
  const difference = compare(resultsBaseQuery, resultsLocalQuery)
  const commentId = await getCommentId(prs[0].number)
  await updateOrAddComment(difference, resultsBaseQuery, resultsLocalQuery, prs[0].number, commentId)
})
