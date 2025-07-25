import { printLog, runMain } from '../lib/executionUtils.js'
import { command } from '../lib/command.js'
import { getOrg2ApiKey } from '../lib/secrets.js'

/**
 * Upload test result to datadog
 * Usage:
 * node export-test-result.ts testType
 */

const testType: string = process.argv[2]
const resultFolder: string = `test-report/${testType}/`

runMain(() => {
  command`datadog-ci junit upload --service browser-sdk --env ci --tags test.type:${testType} ${resultFolder}`
    .withEnvironment({
      DATADOG_API_KEY: getOrg2ApiKey(),
    })
    .withLogs()
    .run()

  printLog(`Export ${testType} tests done.`)
})
