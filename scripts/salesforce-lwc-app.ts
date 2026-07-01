import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { parseArgs } from 'node:util'

import { printLog, runMain } from './lib/executionUtils.ts'
import { getSfLwcClientId, getSfLwcInstanceUrl, getSfLwcJwtPrivateKey, getSfLwcUsername } from './lib/secrets.ts'
import { command } from './lib/command.ts'
import { buildSalesforceLwcUrl } from './lib/buildSalesforceLwcUrl.ts'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const salesforceAppDir = resolve(repositoryRoot, 'test/apps/sf-lwc-app')
const defaultTargetOrg = 'sf-lwc-ci'

runMain(() => {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: {
        type: 'boolean',
        short: 'h',
      },
      proxy: {
        type: 'string',
      },
    },
  })

  if (values.help) {
    showUsageAndExit()
  }

  if (positionals.length !== 1) {
    throw new Error('Usage: node scripts/salesforce-lwc-app.ts <auth|deploy-app|get-url>')
  }

  const commandName = positionals[0]

  switch (commandName) {
    // Authenticate in the Salesforce CLI.
    case 'auth':
      authenticate()
      break
    // Deploy the app to the Salesforce org. To be done only when the app is updated.
    case 'deploy-app':
      deployApp()
      break
    // Get the authenticated URL of the app with the RUM configuration.
    case 'get-url':
      process.stdout.write(`with the following URL: ${buildSalesforceLwcUrl(values.proxy)}\n`)
      break
    default:
      throw new Error(`Unknown command "${commandName ?? ''}". Expected: auth|deploy-app|get-url`)
  }
})

function showUsageAndExit() {
  console.log('Usage: node scripts/salesforce-lwc-app.ts <auth|deploy-app|get-url> [--proxy <url>]')
  process.exit(0)
}

function authenticate() {
  // Temporary directory holding the JWT private key for the duration of authentication.
  // Using a unique temp dir avoids collisions when multiple CI jobs run in parallel.
  const keyDirectory = mkdtempSync(resolve(tmpdir(), 'sf-lwc-jwt-'))
  const serverKeyPath = resolve(keyDirectory, 'server.key')

  try {
    writeFileSync(serverKeyPath, Buffer.from(getSfLwcJwtPrivateKey(), 'base64').toString('utf8'), { mode: 0o600 })
    // writeFileSync mode can be masked by the process umask; chmodSync guarantees owner-only access.
    chmodSync(serverKeyPath, 0o600)

    printLog(`Authenticating Salesforce CLI alias ${defaultTargetOrg}...`)
    command`sf org login jwt --client-id ${getSfLwcClientId()} --jwt-key-file ${serverKeyPath} --username ${getSfLwcUsername()} --instance-url ${getSfLwcInstanceUrl()} --alias ${defaultTargetOrg}`
      .withCurrentWorkingDirectory(salesforceAppDir)
      .withLogs()
      .run()
    printLog(`Salesforce CLI authenticated as ${defaultTargetOrg}.`)
  } finally {
    rmSync(keyDirectory, { recursive: true, force: true })
  }
}

function deployApp() {
  const targetOrg = process.env.SF_TARGET_ORG ?? defaultTargetOrg

  printLog(`Deploying Salesforce LWC app to ${targetOrg}...`)
  command`sf project deploy start --target-org ${targetOrg} --source-dir force-app --ignore-conflicts --concise`
    .withCurrentWorkingDirectory(salesforceAppDir)
    .withLogs()
    .run()
  printLog('Salesforce LWC app deployed.')
}
