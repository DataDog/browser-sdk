const { fetchHandlingError } = require('../lib/execution-utils')
const { getOrg2ApiKey } = require('../lib/secrets')
const { timeout } = require('../lib/execution-utils')
const { browserSdkVersion } = require('../lib/browser-sdk-version')
const LOG_INTAKE_URL = 'https://http-intake.logs.datadoghq.com/api/v2/logs'
const LOG_INTAKE_REQUEST_HEADERS = {
  'DD-API-KEY': getOrg2ApiKey(),
  'Content-Type': 'application/json',
}
const TIMEOUT_IN_MS = 15000

async function reportToDatadog(data, dataType) {
  let logData
  switch (dataType) {
    case 'bundleSizes':
      logData = createBundleSizesLogData(data, browserSdkVersion)
      break
    case 'memoryPerformance':
      logData = createMemoryPerformanceLogData(data, browserSdkVersion)
      break
  }
  await sendLogToOrg2(logData)
}

function createBundleSizesLogData(bundleSizes, browserSdkVersion) {
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

function createMemoryPerformanceLogData(memoryPerformance, browserSdkVersion) {
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

async function sendLogToOrg2(logData = []) {
  await fetchHandlingError(LOG_INTAKE_URL, {
    method: 'POST',
    headers: LOG_INTAKE_REQUEST_HEADERS,
    body: JSON.stringify(logData),
  })
  // Wait for logs ingestion
  await timeout(TIMEOUT_IN_MS)
}

module.exports = {
  reportToDatadog,
}
