import { fetchHandlingError, formatPercentage, timeout } from '../../lib/executionUtils.ts'
import { getOrg2ApiKey, getOrg2AppKey } from '../../lib/secrets.ts'
import { fetchPR, LOCAL_BRANCH } from '../../lib/gitUtils.ts'
import type { Pr } from './reportAsAPrComment.ts'
import { markdownArray } from './reportAsAPrComment.ts'
import type { PerformanceMetric } from './fetchPerformanceMetrics.ts'
import { fetchPerformanceMetrics } from './fetchPerformanceMetrics.ts'
import { TESTS } from './constants.ts'

const API_KEY = getOrg2ApiKey()
const APP_KEY = getOrg2AppKey()
const TIMEOUT_IN_MS = 15000
const TEST_PUBLIC_ID = 'vcg-7rk-5av'
const RETRIES_NUMBER = 6
const LOCAL_COMMIT_SHA = process.env.CI_COMMIT_SHORT_SHA

interface SyntheticsTestResult {
  results: Array<{
    result_id: string
  }>
}

interface SyntheticsTestStatus {
  length: number
  status?: number
}

export async function computeAndReportCpuPerformance(pr?: Pr) {
  const localCpuPerformances = await computeCpuPerformance()
  // local metrics reported directly by synthetics tests
  if (!pr) {
    return
  }
  let baseCpuPerformances: PerformanceMetric[]
  try {
    baseCpuPerformances = await fetchPerformanceMetrics(
      'cpu',
      localCpuPerformances.map((cpuPerformance) => cpuPerformance.name),
      pr.lastCommonCommit
    )
  } catch (error) {
    await pr.setCpuPerformance('Error fetching base CPU performance')
    throw error
  }

  await pr.setCpuPerformance(
    formatCpuPerformance({
      baseCpuPerformances,
      localCpuPerformances,
    })
  )
}

async function computeCpuPerformance(): Promise<PerformanceMetric[]> {
  const pr = LOCAL_BRANCH ? await fetchPR(LOCAL_BRANCH) : null
  const commitSha = LOCAL_COMMIT_SHA || ''
  const resultId = pr
    ? await triggerSyntheticsTest(pr.number.toString(), commitSha)
    : await triggerSyntheticsTest('', commitSha)
  await waitForSyntheticsTestToFinish(resultId, RETRIES_NUMBER)
  return fetchPerformanceMetrics(
    'cpu',
    TESTS.map((test) => test.property),
    LOCAL_COMMIT_SHA || ''
  )
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

function formatCpuPerformance({
  baseCpuPerformances,
  localCpuPerformances,
}: {
  baseCpuPerformances: PerformanceMetric[]
  localCpuPerformances: PerformanceMetric[]
}) {
  return markdownArray({
    headers: [
      { label: 'Action Name', align: 'left' },
      { label: 'Base CPU Time (ms)', align: 'right' },
      { label: 'Local CPU Time (ms)', align: 'right' },
      { label: '𝚫%', align: 'right' },
    ],
    rows: localCpuPerformances.map((localCpuPerformance) => {
      const baseCpuPerformance = baseCpuPerformances.find(
        (baseCpuPerformance) => baseCpuPerformance.name === localCpuPerformance.name
      )

      if (!baseCpuPerformance) {
        return [localCpuPerformance.name, 'N/A', String(localCpuPerformance.value), 'N/A']
      }

      return [
        TESTS.find((test) => test.property === localCpuPerformance.name)!.name,
        String(baseCpuPerformance.value),
        String(localCpuPerformance.value),
        formatPercentage((localCpuPerformance.value - baseCpuPerformance.value) / baseCpuPerformance.value, {
          includeSign: true,
        }),
      ]
    }),
  })
}
