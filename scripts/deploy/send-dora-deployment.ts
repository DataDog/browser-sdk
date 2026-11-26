import { printLog, printWarning, runMain } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { browserSdkVersion } from '../lib/browserSdkVersion.ts'
import { getOrg2ApiKey } from '../lib/secrets.ts'

/**
 * Send a DORA Metrics deployment event (org2) for each SDK service, at the end of a release.
 * The deployment starts when the deploy pipeline starts, and finishes now.
 * Usage:
 * node send-dora-deployment.ts
 */

const SERVICES = ['browser-rum-sdk', 'browser-logs-sdk']
const REPOSITORY_URL = 'https://github.com/DataDog/browser-sdk'

if (!process.env.NODE_TEST_CONTEXT) {
  runMain(() => main())
}

export function main(): void {
  const startedAt = process.env.CI_PIPELINE_CREATED_AT
  const commitSha = process.env.CI_COMMIT_SHA
  if (!startedAt || !commitSha) {
    printWarning('CI_PIPELINE_CREATED_AT and CI_COMMIT_SHA environment variables are required, skipping.')
    return
  }

  const finishedAt = new Date().toISOString()

  for (const service of SERVICES) {
    printLog(`Sending the DORA deployment of ${service} ${browserSdkVersion}...`)

    try {
      const apiKey = getOrg2ApiKey()
      command`
        datadog-ci dora deployment
          --service ${service}
          --env prod
          --version ${browserSdkVersion}
          --team rum-browser
          --started-at ${startedAt}
          --finished-at ${finishedAt}
          --git-repository-url ${REPOSITORY_URL}
          --git-commit-sha ${commitSha}
      `
        .withEnvironment({
          DD_API_KEY: apiKey,
          DD_SITE: 'datadoghq.com',
        })
        .withLogs()
        .run()
    } catch (error) {
      // The release is already done: a DORA Metrics issue (API key lookup, intake error) must not fail the job
      printWarning(`Failed to send the DORA deployment of ${service}:`, error)
    }
  }
}
