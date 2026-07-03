import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { parseArgs } from 'node:util'

import { printLog, runMain } from './lib/executionUtils.ts'
import { getSfLwcClientId, getSfLwcInstanceUrl, getSfLwcJwtPrivateKey, getSfLwcUsername } from './lib/secrets.ts'
import { command } from './lib/command.ts'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const salesforceAppDir = resolve(repositoryRoot, 'test/apps/sf-lwc-app')
const SALESFORCE_HOME_PATH = '/lightning/app/c__SF_LWC_App/page/home'
const TARGET_ORG = 'sf-lwc-ci'

runMain(() => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: {
        type: 'boolean',
        short: 'h',
      },
    },
  })

  if (values.help) {
    showUsageAndExit()
  }

  if (positionals.length !== 1) {
    throw new Error('Usage: node scripts/salesforce-lwc-app.ts <deploy-app|get-url>')
  }

  const commandName = positionals[0]

  switch (commandName) {
    // Deploy the app to the Salesforce org. To be done only when the app is updated.
    case 'deploy-app':
      deployApp()
      break
    // Get the authenticated URL of the app.
    case 'get-url':
      printSalesforceLwcUrl()
      break
    default:
      throw new Error(`Unknown command "${commandName ?? ''}". Expected: deploy-app|get-url`)
  }
})

function showUsageAndExit() {
  console.log('Usage: node scripts/salesforce-lwc-app.ts <deploy-app|get-url>')
  process.exit(0)
}

function authenticate(targetOrg: string) {
  // Temporary directory holding the JWT private key for the duration of authentication.
  // Using a unique temp dir avoids collisions when multiple CI jobs run in parallel.
  const keyDirectory = mkdtempSync(resolve(tmpdir(), 'sf-lwc-jwt-'))
  const serverKeyPath = resolve(keyDirectory, 'server.key')

  try {
    writeFileSync(serverKeyPath, Buffer.from(getSfLwcJwtPrivateKey(), 'base64').toString('utf8'), { mode: 0o600 })
    // writeFileSync mode can be masked by the process umask; chmodSync guarantees owner-only access.
    chmodSync(serverKeyPath, 0o600)

    printLog(`Authenticating Salesforce CLI alias ${targetOrg}...`)
    command`sf org login jwt --client-id ${getSfLwcClientId()} --jwt-key-file ${serverKeyPath} --username ${getSfLwcUsername()} --instance-url ${getSfLwcInstanceUrl()} --alias ${targetOrg}`
      .withCurrentWorkingDirectory(salesforceAppDir)
      .withLogs()
      .run()
    printLog(`Salesforce CLI authenticated as ${targetOrg}.`)
  } finally {
    rmSync(keyDirectory, { recursive: true, force: true })
  }
}

function deployApp() {
  authenticate(TARGET_ORG)

  printLog(`Deploying Salesforce LWC app to ${TARGET_ORG}...`)
  command`sf project deploy start --target-org ${TARGET_ORG} --source-dir force-app --ignore-conflicts --concise`
    .withCurrentWorkingDirectory(salesforceAppDir)
    .withLogs()
    .run()
  printLog('Salesforce LWC app deployed.')
}

function printSalesforceLwcUrl(): void {
  const path = new URL(SALESFORCE_HOME_PATH, 'https://salesforce.local')

  authenticate(TARGET_ORG)

  command`sf org open --target-org ${TARGET_ORG} --path ${path.pathname}${path.search} --url-only`
    .withCurrentWorkingDirectory(salesforceAppDir)
    .withLogs()
    .run()
}
