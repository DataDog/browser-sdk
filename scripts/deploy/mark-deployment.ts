import { parseArgs } from 'node:util'
import { printLog, printWarning, runMain } from '../lib/executionUtils.ts'
import { command } from '../lib/command.ts'
import { getBuildEnvSdkVersion } from '../lib/buildEnv.ts'
import { getOrg2ApiKey } from '../lib/secrets.ts'
import { packages } from './lib/deploymentUtils.ts'

/**
 * Mark the current CI job as a deployment in CD Visibility (org2).
 * The job duration and status become the deployment duration and status.
 * Usage:
 * BUILD_MODE=canary|release node mark-deployment.ts --env canary|prod [--datacenter us1 --datacenter eu1 ...]
 */

// `datadog-ci deployment mark` tags the CI job, so a job can only be the deployment of one service. Each deployment
// ships every package, so we use the main service and list the packages in tags.
const SERVICE = 'browser-rum-sdk'

if (!process.env.NODE_TEST_CONTEXT) {
  runMain(() => main(...process.argv.slice(2)))
}

export function main(...args: string[]): void {
  const {
    values: { env, datacenter: datacenters = [] },
  } = parseArgs({
    args,
    options: {
      env: { type: 'string' },
      datacenter: { type: 'string', multiple: true },
    },
  })

  if (!env) {
    throw new Error('--env argument is required')
  }

  const revision = getBuildEnvSdkVersion()
  const tags = [
    'team:rum-browser',
    ...datacenters.map((datacenter) => `datacenter:${datacenter}`),
    ...packages.map(({ packageName }) => `package:${packageName}`),
  ]

  printLog(`Marking the job as a ${SERVICE} deployment to ${env} (revision ${revision})...`)

  // A CD Visibility issue (API key lookup, intake error) must not block a deployment
  try {
    command`
    datadog-ci deployment mark --no-fail
      --service ${SERVICE}
      --env ${env}
      --revision ${revision}
      ${tags.flatMap((tag) => ['--tags', tag])}
  `
      .withEnvironment({
        DD_API_KEY: getOrg2ApiKey(),
        DD_SITE: 'datadoghq.com',
        DD_BETA_COMMANDS_ENABLED: '1',
      })
      .withLogs()
      .run()
  } catch (error) {
    printWarning('Failed to mark the deployment in CD Visibility:', error)
  }
}
