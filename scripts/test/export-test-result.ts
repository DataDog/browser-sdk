import { printLog, runMain } from '../lib/executionUtils'
import { command } from '../lib/command'
import { getOrg2ApiKey } from '../lib/secrets'

/**
 * Upload test result to datadog
 * Usage:
 * node export-test-result.js testType
 */

const testType = process.argv[2]
const resultFolder = `test-report/${testType}/`

runMain(() => {
  command`datadog-ci junit upload --service browser-sdk --env ci --tags test.type:${testType} ${resultFolder}`
    .withEnvironment({
      DATADOG_API_KEY: getOrg2ApiKey(),
    })
    .withLogs()
    .run()

  printLog(`Export ${testType} tests done.`)
})
