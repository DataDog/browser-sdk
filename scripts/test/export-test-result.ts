import { printLog, runMain } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { getOrg2ApiKey } from '../lib/secrets.ts'

/**
 * Upload test result to datadog
 * Usage:
 * node export-test-result.ts testType
 */

const testType = process.argv[2]
const resultFolder = `test-report/${testType}/`
const coverageFolder = `coverage/${testType}/`

runMain(() => {
  command`datadog-ci junit upload --service browser-sdk --env ci --tags test.type:${testType} ${resultFolder}`
    .withEnvironment({
      DATADOG_API_KEY: getOrg2ApiKey(),
    })
    .withLogs()
    .run()
  command`datadog-ci coverage upload --tags service:browser-sdk --tags env:ci --tags test.type:${testType} ${coverageFolder}`
    .withEnvironment({
      DATADOG_API_KEY: getOrg2ApiKey(),
    })
    .withLogs()
    .run()

  printLog(`Export ${testType} tests done.`)
})
