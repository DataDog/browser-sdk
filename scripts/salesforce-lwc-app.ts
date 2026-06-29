import { chmodSync, copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from 'node:child_process'

import { printLog, runMain } from './lib/executionUtils.ts'
import { getSfLwcClientId, getSfLwcInstanceUrl, getSfLwcJwtPrivateKey, getSfLwcUsername } from './lib/secrets.ts'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const salesforceAppDir = resolve(repositoryRoot, 'test/apps/sf-lwc-app')
const bundlePath = resolve(repositoryRoot, 'packages/browser-rum-slim/bundle/datadog-rum-slim.js')
const stableStaticResourcePath = resolve(salesforceAppDir, 'force-app/main/default/staticresources/datadog_rum_slim.js')
const salesforceHomePath = '/lightning/app/c__SF_LWC_App/page/home'
const defaultTargetOrg = 'sf-lwc-ci'
const salesforceCliPackage = '@salesforce/cli@2.139.6'

runMain(() => {
  const [commandName] = process.argv.slice(2)

  switch (commandName) {
    case 'auth':
      authenticate()
      break
    case 'deploy-app':
      deployApp()
      break
    case 'open-url':
      process.stdout.write(`${buildOpenUrl()}\n`)
      break
    default:
      throw new Error('Usage: node scripts/salesforce-lwc-app.ts <auth|deploy-app|open-url>')
  }
})

function authenticate() {
  const keyDirectory = mkdtempSync(resolve(tmpdir(), 'sf-lwc-jwt-'))
  const keyPath = resolve(keyDirectory, 'server.key')

  try {
    writeFileSync(keyPath, getSfLwcJwtPrivateKey(), { mode: 0o600 })
    chmodSync(keyPath, 0o600)

    printLog(`Authenticating Salesforce CLI alias ${defaultTargetOrg}...`)
    runSf([
      'org',
      'login',
      'jwt',
      '--client-id',
      getSfLwcClientId(),
      '--jwt-key-file',
      keyPath,
      '--username',
      getSfLwcUsername(),
      '--instance-url',
      getSfLwcInstanceUrl(),
      '--alias',
      defaultTargetOrg,
      '--json',
    ])
    printLog(`Salesforce CLI authenticated as ${defaultTargetOrg}.`)
  } finally {
    rmSync(keyDirectory, { recursive: true, force: true })
  }
}

function deployApp() {
  const targetOrg = getTargetOrg()

  printLog(`Deploying Salesforce LWC app to ${targetOrg}...`)
  copyFileSync(bundlePath, stableStaticResourcePath)

  const deployArgs = [
    'project',
    'deploy',
    'start',
    '--target-org',
    targetOrg,
    '--source-dir',
    'force-app',
    '--ignore-conflicts',
  ]
  const spawnOptions: SpawnSyncOptionsWithStringEncoding = { encoding: 'utf8', cwd: salesforceAppDir, stdio: 'pipe' }

  let result = spawnSync('sf', deployArgs, spawnOptions)
  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
    result = spawnSync('yarn', ['dlx', '-p', salesforceCliPackage, 'sf', ...deployArgs], spawnOptions)
  }

  if (result.stdout) {
    process.stdout.write(result.stdout)
  }

  if (result.status !== 0) {
    const output = (result.stdout ?? '') + (result.stderr ?? '')
    // Source tracking fails on orgs that don't support it (e.g. developer orgs), but components
    // are deployed successfully. Treat this specific post-deploy tracking error as non-fatal.
    if (!output.includes('Could not find HEAD')) {
      throw new Error(result.stderr || result.stdout || result.error?.message)
    }
    printLog('Warning: Source tracking update failed (Could not find HEAD). Components were deployed successfully.')
  }

  assignPermissionSet(targetOrg, 'SF_LWC_App')
  printLog('Salesforce LWC app deployed.')
}

function assignPermissionSet(targetOrg: string, permSetName: string) {
  const result = spawnSync(
    'sf',
    ['org', 'assign', 'permset', '--name', permSetName, '--target-org', targetOrg, '--json'],
    { encoding: 'utf8', cwd: salesforceAppDir }
  )
  const output = (result.stdout ?? '') + (result.stderr ?? '')
  // A duplicate assignment error means the permset is already assigned — not a real failure.
  if (result.status !== 0 && !output.includes('Duplicate')) {
    throw new Error(`Failed to assign permission set ${permSetName}: ${result.stderr || result.stdout}`)
  }
  printLog(`Permission set ${permSetName} assigned.`)
}

function buildOpenUrl(): string {
  const targetOrg = getTargetOrg()
  const path = new URL(salesforceHomePath, 'https://salesforce.local')

  path.searchParams.set(
    'c__datadogInitConfiguration',
    JSON.stringify({
      applicationId: '37fe52bf-b3d5-4ac7-ad9b-44882d479ec8',
      clientToken: 'pubf2099de38f9c85797d20d64c7d632a69',
      defaultPrivacyLevel: 'allow',
      trackResources: true,
      trackLongTasks: true,
      enableExperimentalFeatures: [],
      allowUntrustedEvents: true,
      sessionReplaySampleRate: 100,
      telemetrySampleRate: 100,
      telemetryUsageSampleRate: 100,
      telemetryConfigurationSampleRate: 100,
      service: 'browser-sdk-salesforce-e2e',
      env: 'e2e',
    })
  )

  const result = runSf([
    'org',
    'open',
    '--target-org',
    targetOrg,
    '--path',
    `${path.pathname}${path.search}`,
    '--url-only',
    '--json',
  ])

  const data = parseSfJsonOutput(result.stdout, result.stderr)
  if (!data.result?.url) {
    throw new Error(`Salesforce CLI did not return a URL: ${result.stdout}`)
  }
  return data.result.url
}

function runSf(args: string[], options: Partial<SpawnSyncOptionsWithStringEncoding> = {}): SpawnSyncReturns<string> {
  const spawnOptions = {
    encoding: 'utf8' as const,
    cwd: salesforceAppDir,
    ...options,
  }
  const result = spawnSync('sf', args, spawnOptions)

  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
    return runSfWithYarnDlx(args, spawnOptions)
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || result.error?.message)
  }
  return result
}

function runSfWithYarnDlx(args: string[], options: SpawnSyncOptionsWithStringEncoding): SpawnSyncReturns<string> {
  const result = spawnSync('yarn', ['dlx', '-p', salesforceCliPackage, 'sf', ...args], options)
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || result.error?.message)
  }
  return result
}

function parseSfJsonOutput(stdout: string, stderr: string): { result?: { url?: string } } {
  const sanitizedStdout = stripCliControlCharacters(stdout)
  const jsonStart = sanitizedStdout.indexOf('{')
  const jsonEnd = sanitizedStdout.lastIndexOf('}')

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
    throw new Error(`Salesforce CLI did not return JSON.\nstdout:\n${stdout}\nstderr:\n${stderr}`)
  }

  try {
    return JSON.parse(sanitizedStdout.slice(jsonStart, jsonEnd + 1)) as { result?: { url?: string } }
  } catch (error) {
    throw new Error(`Salesforce CLI returned invalid JSON.\nstdout:\n${stdout}\nstderr:\n${stderr}`, { cause: error })
  }
}

/* eslint-disable no-control-regex */
function stripCliControlCharacters(output: string): string {
  return output
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[PX^_][\s\S]*?\x1b\\/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
}
/* eslint-enable no-control-regex */

function getTargetOrg(): string {
  return process.env.SF_TARGET_ORG || defaultTargetOrg
}
