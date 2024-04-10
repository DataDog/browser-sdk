const { fetchHandlingError } = require('../../lib/execution-utils')
const { getOrg2ApiKey, getOrg2AppKey } = require('../../lib/secrets')
const { timeout } = require('../../lib/execution-utils')
const API_KEY = getOrg2ApiKey()
const APP_KEY = getOrg2AppKey()
const TIMEOUT_IN_MS = 10000
const TEST_PUBLIC_ID = 'vcg-7rk-5av'

async function syntheticTrigger(prNumber, commitId) {
  const body = {
    tests: [
      {
        public_id: `${TEST_PUBLIC_ID}`,
        startUrl: `https://datadoghq.dev/browser-sdk-test-playground/performance/?prNumber=${prNumber}&commitId=${commitId}`,
      },
    ],
  }
  const url = 'https://api.datadoghq.com/api/v1/synthetics/tests/trigger/ci'
  const response = await fetchHandlingError(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'DD-API-KEY': API_KEY,
      'DD-APPLICATION-KEY': APP_KEY,
    },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  return data.results[0].result_id
}

async function getSyntheticTestResult(resultId, RETRIES_NUMBER) {
  const url = `https://api.datadoghq.com/api/v1/synthetics/tests/${TEST_PUBLIC_ID}/results/${resultId}`
  for (let i = 0; i < RETRIES_NUMBER; i++) {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': API_KEY,
        'DD-APPLICATION-KEY': APP_KEY,
      },
    })
    const data = await response.json()
    if (data.length !== 0 && data.status === 0) {
      break
    }
    await timeout(TIMEOUT_IN_MS)
  }
}
module.exports = {
  getSyntheticTestResult,
  syntheticTrigger,
}
