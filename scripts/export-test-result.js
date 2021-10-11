'use strict'

const { getSecretKey, executeCommand, printLog, logAndExit } = require('./utils')

async function main() {
  const ddCiApiKey = (await getSecretKey('ci.browser-sdk.datadog_ci_api_key')).trim()
  const unitTestFolders = ['test-report/unit/', 'test-report/unit-bs/']
  const e2eTestFolders = ['test-report/e2e/', 'test-report/e2e-bs/']

  await executeCommand(
    `npx @datadog/datadog-ci junit upload --service browser-sdk --env ci --tags type:unit ${unitTestFolders.join(' ')}`,
    { DATADOG_API_KEY: ddCiApiKey }
  )
  printLog('Export unit tests done.')

  await executeCommand(
    `npx @datadog/datadog-ci junit upload --service browser-sdk --env ci --tags type:e2e ${e2eTestFolders.join(' ')}`,
    { DATADOG_API_KEY: ddCiApiKey }
  )
  printLog('Export e2e tests done.')
}

main().catch(logAndExit)
