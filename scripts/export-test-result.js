'use strict'

const { getSecretKey, command, printLog, runMain } = require('./utils')

/**
 * Upload test result to datadog
 * Usage:
 * node export-test-result.js testType
 */

const testType = process.argv[2]
const resultFolder = `test-report/${testType}/`

runMain(() => {
  const DATADOG_API_KEY = getSecretKey('ci.browser-sdk.datadog_ci_api_key')

  command`datadog-ci junit upload --service browser-sdk --env ci --tags test.type:${testType} ${resultFolder}`
    .withEnvironment({
      DATADOG_API_KEY,
    })
    .run()

  printLog(`Export ${testType} tests done.`)
})
