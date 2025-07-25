import { fetchHandlingError, timeout } from '../../lib/executionUtils'
import { getOrg2ApiKey, getOrg2AppKey } from '../../lib/secrets'
import { fetchPR, LOCAL_BRANCH } from '../../lib/gitUtils'
import { LOCAL_COMMIT_SHA } from './reportAsAPrComment'

const API_KEY = getOrg2ApiKey()
const APP_KEY = getOrg2AppKey()
const TIMEOUT_IN_MS = 15000
const TEST_PUBLIC_ID = 'vcg-7rk-5av'
const RETRIES_NUMBER = 6

interface SyntheticsTestResult {
  results: Array<{
    result_id: string
  }>
}

interface SyntheticsTestStatus {
  length: number
  status?: number
}

export async function computeCpuPerformance(): Promise<void> {
  const pr = LOCAL_BRANCH ? await fetchPR(LOCAL_BRANCH) : null
  const commitSha = LOCAL_COMMIT_SHA || ''
  const resultId = pr
    ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      await triggerSyntheticsTest(pr.number.toString(), commitSha)
    : await triggerSyntheticsTest('', commitSha)
  await waitForSyntheticsTestToFinish(resultId, RETRIES_NUMBER)
}

async function triggerSyntheticsTest(prNumber: string, commitId: string): Promise<string> {
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
