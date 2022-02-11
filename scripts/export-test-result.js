'use strict'

const { getSecretKey, executeCommand, printLog, logAndExit } = require('./utils')

async function main() {
  await exportTestResult('unit', 'test-report/unit/')
  await exportTestResult('unit-bs', 'test-report/unit-bs/')
  await exportTestResult('e2e', 'test-report/e2e/')
  await exportTestResult('e2e-bs', 'test-report/e2e-bs/')
}

async function exportTestResult(type, folder) {
  const DATADOG_API_KEY = await getSecretKey('ci.browser-sdk.datadog_ci_api_key')

  await executeCommand(`datadog-ci junit upload --service browser-sdk --env ci --tags test.type:${type} ${folder}`, {
    DATADOG_API_KEY,
  })

  printLog(`Export ${type} tests done.`)
}

main().catch(logAndExit)
