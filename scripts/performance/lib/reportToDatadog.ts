import { fetchHandlingError } from '../../lib/executionUtils'
import { getOrg2ApiKey } from '../../lib/secrets'
import { browserSdkVersion } from '../../lib/browserSdkVersion'

const LOG_INTAKE_URL = 'https://http-intake.logs.datadoghq.com/api/v2/logs'
const LOG_INTAKE_REQUEST_HEADERS = {
  'DD-API-KEY': getOrg2ApiKey(),
  'Content-Type': 'application/json',
}

interface BundleSizesLog {
  message: string
  service: string
  ddsource: string
  env: string
  bundle_sizes: Record<string, number>
  version: string
  commit: string | undefined
  branch: string | undefined
}

interface MemoryPerformanceData {
  testProperty: string
  sdkMemoryBytes: number
  sdkMemoryPercentage: number
}

interface MemoryPerformanceLog {
  message: string
  service: string
  ddsource: string
  env: string
  version: string
  commit: string | undefined
  branch: string | undefined
  [key: string]: any
}

type LogData = BundleSizesLog[] | MemoryPerformanceLog[]

export async function reportToDatadog(
  data: Record<string, number> | MemoryPerformanceData[],
  dataType: 'bundleSizes' | 'memoryPerformance'
): Promise<void> {
  let logData: LogData
  switch (dataType) {
    case 'bundleSizes':
      logData = createBundleSizesLogData(data as Record<string, number>, browserSdkVersion)
      break
    case 'memoryPerformance':
      logData = createMemoryPerformanceLogData(data as MemoryPerformanceData[], browserSdkVersion)
      break
  }
  await sendLogToOrg2(logData)
}

function createBundleSizesLogData(bundleSizes: Record<string, number>, browserSdkVersion: string): BundleSizesLog[] {
  return [
    {
      message: 'Browser SDK bundles sizes',
      service: 'browser-sdk',
      ddsource: 'browser-sdk',
      env: 'ci',
      bundle_sizes: bundleSizes,
      version: browserSdkVersion,
      commit: process.env.CI_COMMIT_SHORT_SHA,
      branch: process.env.CI_COMMIT_REF_NAME,
    },
  ]
}

function createMemoryPerformanceLogData(
  memoryPerformance: MemoryPerformanceData[],
  browserSdkVersion: string
): MemoryPerformanceLog[] {
  const memoryPerformanceData = Object.fromEntries(
    memoryPerformance.map(({ testProperty, sdkMemoryBytes, sdkMemoryPercentage }) => [
      testProperty,
      { memory_bytes: sdkMemoryBytes, memory_percentage: sdkMemoryPercentage },
    ])
  )
  return [
    {
      message: 'Browser SDK memory consumption',
      service: 'browser-sdk',
      ddsource: 'browser-sdk',
      env: 'ci',
      ...memoryPerformanceData,
      version: browserSdkVersion,
      commit: process.env.CI_COMMIT_SHORT_SHA,
      branch: process.env.CI_COMMIT_REF_NAME,
    },
  ]
}

async function sendLogToOrg2(logData: LogData = []): Promise<void> {
  await fetchHandlingError(LOG_INTAKE_URL, {
    method: 'POST',
    headers: LOG_INTAKE_REQUEST_HEADERS,
    body: JSON.stringify(logData),
  })
}
