'use strict'

const { getSecretKey, executeCommand, printLog, logAndExit } = require('./utils')

async function main() {
  const ddCiApiKey = (await getSecretKey('ci.browser-sdk.datadog_ci_api_key')).trim()
  const testFolders = ['test-report/unit/', 'test-report/e2e/', 'test-report/unit-bs/', 'test-report/e2e-bs/']
  await executeCommand(`npx @datadog/datadog-ci junit upload --service browser-sdk --env ci ${testFolders.join(' ')}`, {
    DATADOG_API_KEY: ddCiApiKey,
  })
  printLog('Export done.')
}

main().catch(logAndExit)
