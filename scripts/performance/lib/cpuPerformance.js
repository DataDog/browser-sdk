const { fetchHandlingError, timeout, printError } = require('../../lib/executionUtils')
const { getOrg2ApiKey, getOrg2AppKey } = require('../../lib/secrets')
const { fetchPerformanceMetrics } = require('./fetchPerformanceMetrics')
const { TESTS_CONFIG } = require('./constants')
const { compare, markdownArray } = require('./formatUtils')

const LOCAL_COMMIT_SHA = process.env.CI_COMMIT_SHORT_SHA
const TIMEOUT_IN_MS = 15000
const TEST_PUBLIC_ID = 'vcg-7rk-5av'
const RETRIES_NUMBER = 6
const API_KEY = getOrg2ApiKey()
const APP_KEY = getOrg2AppKey()

exports.runCpuPerformance = async function ({ pr, lastCommonCommit, prComment }) {
  try {
    const resultId = await triggerSyntheticsTest(pr.number, LOCAL_COMMIT_SHA)
    await waitForSyntheticsTestToFinish(resultId, RETRIES_NUMBER)
    const cpuPerformanceMessage = await formatCpuPerformance(lastCommonCommit)
    prComment.setCpuPerformanceMessage(cpuPerformanceMessage)
  } catch (error) {
    printError('Error while computing CPU performance:', error)
    prComment.setCpuPerformanceMessage('❌ Failed to compute CPU performance.')
    process.exitCode = 1
  }
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

async function formatCpuPerformance(lastCommonCommit) {
  const testProperties = TESTS_CONFIG.map((test) => test.property)
  const cpuBasePerformance = await fetchPerformanceMetrics('cpu', testProperties, lastCommonCommit)
  const cpuLocalPerformance = await fetchPerformanceMetrics('cpu', testProperties, LOCAL_COMMIT_SHA)
  const differenceCpu = compare(cpuBasePerformance, cpuLocalPerformance)
  const cpuRows = cpuBasePerformance.map((cpuTestPerformance, index) => {
    const localCpuPerf = cpuLocalPerformance[index]
    const diffCpuPerf = differenceCpu[index]
    const baseCpuTestValue = cpuTestPerformance.value !== null ? cpuTestPerformance.value.toFixed(3) : 'N/A'
    const localCpuTestValue = localCpuPerf.value !== null ? localCpuPerf.value.toFixed(3) : 'N/A'
    const diffCpuTestValue = diffCpuPerf.change !== null ? diffCpuPerf.change.toFixed(3) : 'N/A'
    return [cpuTestPerformance.name, baseCpuTestValue, localCpuTestValue, diffCpuTestValue]
  })

  let message = '<details>\n<summary>🚀 CPU Performance</summary>\n\n'
  message += markdownArray({
    headers: ['Action Name', 'Base Average Cpu Time (ms)', 'Local Average Cpu Time (ms)', '𝚫'],
    rows: cpuRows,
  })
  message += '\n</details>\n\n'

  return message
}
