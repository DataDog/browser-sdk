'use strict'

const { getSecretKey, executeCommand, printLog, logAndExit } = require('./utils')

/**
 * Upload test result to datadog
 * Usage:
 * node export-test-result.js testType
 */

const testType = process.argv[2]
const resultFolder = `test-report/${testType}/`

async function main() {
  const DATADOG_API_KEY = await getSecretKey('ci.browser-sdk.datadog_ci_api_key')

  await executeCommand(
    `datadog-ci junit upload --service browser-sdk --env ci --tags test.type:${testType} ${resultFolder}`,
    {
      DATADOG_API_KEY,
    }
  )

  printLog(`Export ${testType} tests done.`)
}

main().catch(logAndExit)
