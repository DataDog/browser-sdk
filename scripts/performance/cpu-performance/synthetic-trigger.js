const { fetchHandlingError } = require('../../lib/execution-utils')
const { getOrg2ApiKey, getOrg2AppKey } = require('../../lib/secrets')
const apiKey = getOrg2ApiKey()
const appKey = getOrg2AppKey()

const url = 'https://api.datadoghq.com/api/v1/synthetics/tests/trigger/ci'

async function syntheticTrigger(prNumber, commitId) {
  const body = {
    tests: [
      {
        public_id: 'vcg-7rk-5av',
        startUrl: `https://datadoghq.dev/browser-sdk-test-playground/performance/?prNumber=${prNumber}&commitId=${commitId}`,
      },
    ],
  }

  await fetchHandlingError(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'DD-API-KEY': apiKey,
      'DD-APPLICATION-KEY': appKey,
    },
    body: JSON.stringify(body),
  })
}

module.exports = {
  syntheticTrigger,
}
