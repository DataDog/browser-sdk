'use strict'

const { getSecretKey, executeCommand, printLog, logAndExit } = require('./utils')

async function main() {
  await exportTestResult('unit', ['test-report/unit/', 'test-report/unit-bs/'])
  await exportTestResult('e2e', ['test-report/e2e/', 'test-report/e2e-bs/'])
}

async function exportTestResult(type, folders) {
  const ddCiApiKey = await getSecretKey('ci.browser-sdk.datadog_ci_api_key')

  await executeCommand(
    `yarn datadog-ci junit upload --service browser-sdk --env ci --tags type:${type} ${folders.join(' ')}`,
    { DATADOG_API_KEY: ddCiApiKey }
  )

  printLog(`Export ${type} tests done.`)
}

main().catch(logAndExit)
