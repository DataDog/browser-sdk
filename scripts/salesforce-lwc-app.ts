import { chmodSync, copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { parseArgs } from 'node:util'

import { printLog, runMain } from './lib/executionUtils.ts'
import { getSfLwcClientId, getSfLwcInstanceUrl, getSfLwcJwtPrivateKey, getSfLwcUsername } from './lib/secrets.ts'
import { command } from './lib/command.ts'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const salesforceAppDir = resolve(repositoryRoot, 'test/apps/sf-lwc-app')
const bundlePath = resolve(repositoryRoot, 'packages/browser-rum-slim/bundle/datadog-rum-slim.js')
const stableStaticResourcePath = resolve(salesforceAppDir, 'force-app/main/default/staticresources/datadog_rum_slim.js')
const salesforceHomePath = '/lightning/app/c__SF_LWC_App/page/home'
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
      process.stdout.write(`with the following URL: ${buildOpenUrl(values.proxy)}\n`)
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
  const targetOrg = getTargetOrg()

  printLog(`Deploying Salesforce LWC app to ${targetOrg}...`)
  // Deploy the app to the Salesforce org. To be done only when the app is updated.
  copyFileSync(bundlePath, stableStaticResourcePath)

  // Clear stale source-tracking state so the deploy doesn't skip files it thinks are already in sync.
  resetSourceTracking(targetOrg)
  command`sf project deploy start --target-org ${targetOrg} --source-dir force-app --ignore-conflicts --concise`
    .withCurrentWorkingDirectory(salesforceAppDir)
    .withLogs()
    .run()
  printLog('Salesforce LWC app deployed.')
}

function resetSourceTracking(targetOrg: string) {
  command`sf project reset tracking --target-org ${targetOrg} --no-prompt`
    .withCurrentWorkingDirectory(salesforceAppDir)
    .withLogs()
    .run()
}

function buildOpenUrl(proxy?: string): string {
  const targetOrg = getTargetOrg()
  const path = new URL(salesforceHomePath, 'https://salesforce.local')

  // c__datadogInitConfiguration must be part of the path (not a top-level frontdoor.jsp param)
  // so that Salesforce passes it through to the Lightning app after authentication.
  if (proxy) {
    path.searchParams.set(
      'c__datadogInitConfiguration',
      JSON.stringify({
        applicationId: '37fe52bf-b3d5-4ac7-ad9b-44882d479ec8',
        clientToken: 'pubf2099de38f9c85797d20d64c7d632a69',
        defaultPrivacyLevel: 'allow',
        trackResources: true,
        trackLongTasks: true,
        proxy,
      })
    )
  }

  const output = command`sf org open --target-org ${targetOrg} --path ${path.pathname}${path.search} --url-only`
    .withCurrentWorkingDirectory(salesforceAppDir)
    .run()

  // The sf CLI appends ANSI reset codes (\x1b[39m etc.) directly to the URL on stdout.
  // Excluding control characters (0x00–0x1f, which includes ESC/0x1b) strips them cleanly.
  // eslint-disable-next-line no-control-regex
  const url = output.match(/https:\/\/[^\s\x00-\x1f]+/g)?.at(-1)
  if (!url) {
    throw new Error(`Unable to find Salesforce URL in command output:\n${output}`)
  }
  return url
}

function getTargetOrg(): string {
  return process.env.SF_TARGET_ORG || defaultTargetOrg
}
