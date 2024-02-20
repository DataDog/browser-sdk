const { runMain, fetch } = require('./lib/execution-utils')
const myToken = process.env.GH_TOKEN
const { getOrg2ApiKey } = require('./lib/secrets')

const BaseBudget = [
  {
    name: 'bundles_sizes_rum',
    queries: 'avg:bundle_sizes.rum{branch:main}',
  },
  {
    name: 'bundles_sizes_logs',
    queries: 'avg:bundle_sizes.logs{branch:main}',
  },
  {
    name: 'bundles_sizes_rum_slim',
    queries: 'avg:bundle_sizes.rum_slim{branch:main}',
  },
  {
    name: 'bundles_sizes_worker',
    queries: 'avg:bundle_sizes.worker{branch:main}',
  },
]

runMain(async () => {
  const results = await query(BaseBudget)
  await addComment(results, 2617)
})

function query() {
  return Promise.all(
    BaseBudget.map(async (budget) => {
      const response = await fetch(`https://api.datadoghq.com/api/v1/query?query=${budget.queries}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'DD-API-KEY': getOrg2ApiKey(),
        },
      })

      const data = await response.json()
      console.log(data)
      return {
        name: budget.name,
        size: data.series[0].pointlist[0][1],
      }
    })
  )
}

async function addComment(data, prNumber) {
  const message = data.map((d) => `${d.name}: ${d.size}`).join('\n')
  await fetch(`https://api.github.com/repos/DataDog/browser-sdk/issues/${prNumber}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `token ${myToken}`,
    },

    body: JSON.stringify({ body: message }),
  })
}
