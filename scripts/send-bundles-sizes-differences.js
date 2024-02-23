const { execSync } = require('child_process')
const { runMain } = require('./lib/execution-utils')
const { getOrg2ApiKey } = require('./lib/secrets')

const baseBranch = 'main'
const localBranch = process.env.CI_COMMIT_REF_NAME.toLowerCase()
const myToken = '' // Function needed to retrieve Github Token

const getLastCommonCommit = (branch) => {
  const command = `git merge-base origin/${branch} HEAD`
  const commit = execSync(command).toString().trim()
  const shortCommand = `git rev-parse --short ${commit}`
  return execSync(shortCommand).toString().trim()
}

const getLatestCommit = (branch) => {
  const command = `git rev-parse --short ${branch}`
  return execSync(command).toString().trim()
}

async function getPRs(branch) {
  const response = await fetch(`https://api.github.com/repos/DataDog/browser-sdk/pulls?head=DataDog:${branch}`, {
    method: 'GET',
    headers: {
      Authorization: `token ${myToken}`,
    },
  })
  const PR = await response.json()
  return PR
}

function createMessage(difference, resultsBaseQuery, resultsLocalQuery) {
  let message =
    '## Bundles Sizes Evolution\n| Bundle | Base Size | Current Size | Diffffference |\n| --- | --- | --- | --- |\n'

  difference.forEach((diff, index) => {
    const baseSize = resultsBaseQuery[index].size
    const localSize = resultsLocalQuery[index].size
    const sign = diff.percentageChange > 0 ? '+' : ''
    message += `| ${formatName(diff.name)} | ${baseSize} | ${localSize} | ${sign}${diff.percentageChange}% |\n`
  })

  return message
}

async function addComment(difference, resultsBaseQuery, resultsLocalQuery, prNumber) {
  const message = createMessage(difference, resultsBaseQuery, resultsLocalQuery)

  await fetch(`https://api.github.com/repos/DataDog/browser-sdk/issues/${prNumber}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `token ${myToken}`,
    },
    body: JSON.stringify({ body: message }),
  })
}

async function updateComment(difference, resultsBaseQuery, resultsLocalQuery, commentId) {
  const message = createMessage(difference, resultsBaseQuery, resultsLocalQuery)

  await fetch(`https://api.github.com/repos/DataDog/browser-sdk/issues/comments/${commentId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `token ${myToken}`,
    },
    body: JSON.stringify({ body: message }),
  })
}

async function getCommentId(prNumber) {
  const response = await fetch(`https://api.github.com/repos/DataDog/browser-sdk/issues/${prNumber}/comments`, {
    method: 'GET',
    headers: {
      Authorization: `token ${myToken}`,
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
            'DD-APPLICATION-KEY': '', // Function needed to retrieve Datadog Application Key
          },
        }
      )
      const data = await response.json()
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

function Compare(resultsBaseQuery, resultsLocalQuery) {
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
  const latestLocalCommit = getLatestCommit(localBranch)
  const prs = await getPRs(localBranch)
  if (prs.length === 0) {
    console.log('No pull requests found')
    return
  }
  const queryBase = loadQuery(lastCommonCommit)
  const queryLocal = loadQuery(latestLocalCommit)
  const resultsBaseQuery = await query(queryBase)
  const resultsLocalQuery = await query(queryLocal)
  const difference = Compare(resultsBaseQuery, resultsLocalQuery)
  const commentId = await getCommentId(prs[0].number)
  if (commentId !== undefined) {
    await updateComment(difference, resultsBaseQuery, resultsLocalQuery, commentId)
  } else {
    await addComment(difference, resultsBaseQuery, resultsLocalQuery, prs[0].number)
  }
})
