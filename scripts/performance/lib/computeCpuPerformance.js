const { fetchHandlingError } = require('../../lib/executionUtils')
const { getOrg2ApiKey, getOrg2AppKey } = require('../../lib/secrets')
const { timeout } = require('../../lib/executionUtils')
const { fetchPR, LOCAL_BRANCH } = require('../../lib/gitUtils')
const { LOCAL_COMMIT_SHA } = require('./reportAsAPrComment')
const API_KEY = getOrg2ApiKey()
const APP_KEY = getOrg2AppKey()
const TIMEOUT_IN_MS = 15000
const TEST_PUBLIC_ID = 'vcg-7rk-5av'
const RETRIES_NUMBER = 6

async function computeCpuPerformance() {
  const pr = await fetchPR(LOCAL_BRANCH)
  const resultId = pr
    ? await triggerSyntheticsTest(pr.number, LOCAL_COMMIT_SHA)
    : await triggerSyntheticsTest('', LOCAL_COMMIT_SHA)
  await waitForSyntheticsTestToFinish(resultId, RETRIES_NUMBER)
}

async function triggerSyntheticsTest(prNumber, commitId) {
  const body = {
    tests: [
      {
        public_id: `${TEST_PUBLIC_ID}`,
        startUrl: `https://datadoghq.dev/browser-sdk-test-playground/performance/cpu?prNumber=${prNumber}&commitId=${commitId}`,
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

async function waitForSyntheticsTestToFinish(resultId, RETRIES_NUMBER) {
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
    // do not use response.ok as we can have 404 responses
    if (response.status >= 500) {
      throw new Error(`HTTP Error Response: ${response.status} ${response.statusText}`)
    }
    const data = await response.json()
    if (data.length !== 0 && data.status === 0) {
      await timeout(TIMEOUT_IN_MS) // Wait for logs ingestion
      return
    }
    await timeout(TIMEOUT_IN_MS)
  }
  throw new Error('Synthetics test did not finish within the specified number of retries')
}

module.exports = {
  computeCpuPerformance,
}
