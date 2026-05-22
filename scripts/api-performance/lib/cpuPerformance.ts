import { fetchHandlingError, timeout } from '../../lib/executionUtils.ts'
import { getOrg2ApiKey, getOrg2AppKey } from '../../lib/secrets.ts'
import { TESTS } from './constants.ts'

// The synthetic test itself reports per-API CPU metrics to Datadog (one metric per
// button on the playground page). This script triggers the run, waits for completion,
// then queries the just-reported metrics back so we can surface them in the CI log.
const API_KEY = getOrg2ApiKey()
const APP_KEY = getOrg2AppKey()
const TIMEOUT_IN_MS = 15000
const TEST_PUBLIC_ID = 'vcg-7rk-5av'
const RETRIES_NUMBER = 6
const ONE_DAY_IN_SECOND = 24 * 60 * 60

interface SyntheticsTestResult {
  results: Array<{ result_id: string }>
}

interface SyntheticsTestStatus {
  length: number
  status?: number
}

interface DatadogResponse {
  series?: Array<{ pointlist?: Array<[number, number]> }>
}

export async function runCpuPerformanceTest(): Promise<void> {
  const commitSha = process.env.CI_COMMIT_SHORT_SHA || ''
  const resultId = await triggerSyntheticsTest(commitSha)
  await waitForSyntheticsTestToFinish(resultId, RETRIES_NUMBER)

  const rows = await Promise.all(
    TESTS.map(async (test) => {
      const value = await fetchCpuMetric(test.property, commitSha)
      return { 'Action Name': test.name, 'CPU Time (ms)': value ?? 'N/A' }
    })
  )
  console.log('CPU Performance:')
  console.table(rows)
}

async function fetchCpuMetric(name: string, commitId: string): Promise<number | undefined> {
  const now = Math.floor(Date.now() / 1000)
  const from = now - 30 * ONE_DAY_IN_SECOND
  const query = `avg:cpu.sdk.${name}.performance.average{commitid:${commitId}}&from=${from}&to=${now}`
  const response = await fetchHandlingError(`https://api.datadoghq.com/api/v1/query?query=${query}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'DD-API-KEY': API_KEY,
      'DD-APPLICATION-KEY': APP_KEY,
    },
  })
  const data = (await response.json()) as DatadogResponse
  const point = data.series?.[0]?.pointlist?.[0]
  return point?.[1]
}

async function triggerSyntheticsTest(commitId: string): Promise<string> {
  const body = {
    tests: [
      {
        public_id: TEST_PUBLIC_ID,
        startUrl: `https://datadoghq.dev/browser-sdk-test-playground/performance/cpu?commitId=${commitId}`,
      },
    ],
  }
  const response = await fetchHandlingError('https://api.datadoghq.com/api/v1/synthetics/tests/trigger/ci', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'DD-API-KEY': API_KEY,
      'DD-APPLICATION-KEY': APP_KEY,
    },
    body: JSON.stringify(body),
  })
  const data = (await response.json()) as SyntheticsTestResult
  return data.results[0].result_id
}

async function waitForSyntheticsTestToFinish(resultId: string, retriesNumber: number): Promise<void> {
  const url = `https://api.datadoghq.com/api/v1/synthetics/tests/${TEST_PUBLIC_ID}/results/${resultId}`
  for (let i = 0; i < retriesNumber; i++) {
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
    const data = (await response.json()) as SyntheticsTestStatus
    if (data.length !== 0 && data.status === 0) {
      await timeout(TIMEOUT_IN_MS) // Wait for logs ingestion
      return
    }
    await timeout(TIMEOUT_IN_MS)
  }
  throw new Error('Synthetics test did not finish within the specified number of retries')
}
