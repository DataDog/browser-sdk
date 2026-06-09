#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const GENERATED_RESOURCE_PREFIX = 'datadogRumSf'
const STATIC_RESOURCE_NAME_PATTERN = /^[A-Za-z](?:[A-Za-z0-9_]*[A-Za-z0-9])?$/
const STATIC_RESOURCE_NAME_MAX_LENGTH = 80
const DEFAULT_STATIC_RESOURCE_TTL_HOURS = 24
const SKIP_DEPLOY_FLAG = '--skip-deploy'

const scriptPath = fileURLToPath(import.meta.url)
const scriptDir = dirname(scriptPath)
const salesforceAppDir = resolve(scriptDir, '..')
const browserSdkRoot = resolve(salesforceAppDir, '../../..')
const staticResourcesDir = resolve(salesforceAppDir, 'force-app/main/default/staticresources')
const sourceBundle = resolve(browserSdkRoot, 'packages/browser-rum-slim/bundle/datadog-rum-slim.js')

if (process.argv[1] === scriptPath) {
  runSalesforceE2e().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

// Runs the full Salesforce e2e flow, optionally reusing an already deployed static resource.
export async function runSalesforceE2e({ env = process.env, args = process.argv.slice(2) } = {}) {
  const skipDeploy = args.includes(SKIP_DEPLOY_FLAG)
  const playwrightArgs = args.filter((arg) => arg !== SKIP_DEPLOY_FLAG)
  let exitCode = 0

  env.SF_ORG_ALIAS ||= 'engrumdev'

  try {
    if (!skipDeploy) {
      const { resourceName, sha } = await prepareStaticResource({ env })
      env.DD_SALESFORCE_E2E_STATIC_RESOURCE_NAME = resourceName
      env.DD_SALESFORCE_E2E_SHA = sha
      deploySalesforceE2eApp({ env })
    }

    exitCode = runCommand('playwright', [
      'test',
      '--config',
      'test/e2e/playwright.salesforce.config.ts',
      ...playwrightArgs,
    ])
  } finally {
    try {
      await cleanupStaticResources({ env })
    } finally {
      cleanupSalesforceLocalState()
    }
  }

  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}

// Builds the RUM slim bundle and writes it as a generated Salesforce static resource.
async function prepareStaticResource({ env = process.env, runBuild = env.SKIP_BUNDLE_BUILD !== '1' } = {}) {
  const sha = env.DD_SALESFORCE_E2E_SHA || env.GITHUB_SHA || 'local'
  const resourceName = validateStaticResourceName(
    env.DD_SALESFORCE_E2E_STATIC_RESOURCE_NAME || buildGeneratedResourceName(env, sha)
  )

  if (runBuild) {
    runRequiredCommand('yarn', ['workspace', '@datadog/browser-rum-slim', 'build:bundle'], {
      cwd: browserSdkRoot,
    })
  }

  if (!existsSync(sourceBundle)) {
    throw new Error(`Salesforce RUM bundle not found: ${sourceBundle}`)
  }

  mkdirSync(staticResourcesDir, { recursive: true })

  const resourcePath = resolve(staticResourcesDir, `${resourceName}.resource`)
  const metadataPath = resolve(staticResourcesDir, `${resourceName}.resource-meta.xml`)

  copyFileSync(sourceBundle, resourcePath)
  writeFileSync(metadataPath, buildStaticResourceMetadata(), 'utf8')
  writeGithubEnv(env.GITHUB_ENV, {
    DD_SALESFORCE_E2E_STATIC_RESOURCE_NAME: resourceName,
    DD_SALESFORCE_E2E_SHA: sha,
  })

  console.log(`DD_SALESFORCE_E2E_STATIC_RESOURCE_NAME=${resourceName}`)
  console.log(`DD_SALESFORCE_E2E_SHA=${sha}`)
  console.log(`Generated ${resourcePath}`)

  return {
    resourceName,
    sha,
    resourcePath,
    metadataPath,
  }
}

// Creates a unique Salesforce-safe static resource name for this CI/local run.
function buildGeneratedResourceName(env, sha) {
  const runId = sanitizeNamePart(env.GITHUB_RUN_ID || env.BUILD_ID || 'local')
  const runAttempt = sanitizeNamePart(env.GITHUB_RUN_ATTEMPT || env.BUILD_ATTEMPT || '1')
  const shaPart = sanitizeNamePart(sha).slice(0, 12) || 'local'
  const localPart = env.GITHUB_RUN_ID || env.BUILD_ID ? undefined : Date.now().toString(36)

  return [GENERATED_RESOURCE_PREFIX, runId, runAttempt, shaPart, localPart]
    .filter(Boolean)
    .join('_')
    .slice(0, STATIC_RESOURCE_NAME_MAX_LENGTH)
    .replace(/_+$/u, '')
}

// Rejects names that Salesforce static resources cannot accept.
function validateStaticResourceName(resourceName) {
  if (
    resourceName.length > STATIC_RESOURCE_NAME_MAX_LENGTH ||
    !STATIC_RESOURCE_NAME_PATTERN.test(resourceName) ||
    resourceName.includes('__') ||
    resourceName.endsWith('_')
  ) {
    throw new Error(
      `Invalid Salesforce static resource name '${resourceName}'. ` +
        'Use letters, numbers, and single underscores; start with a letter.'
    )
  }

  return resourceName
}

// Returns the metadata file content that marks the generated resource as JavaScript.
function buildStaticResourceMetadata() {
  return `<?xml version="1.0" encoding="UTF-8" ?>
<StaticResource xmlns="http://soap.sforce.com/2006/04/metadata">
    <cacheControl>Private</cacheControl>
    <contentType>application/javascript</contentType>
</StaticResource>
`
}

// Converts arbitrary CI strings into valid static resource name segments.
function sanitizeNamePart(value) {
  return String(value)
    .replace(/[^A-Za-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
}

// Writes generated resource values into GitHub Actions env when running in CI.
function writeGithubEnv(githubEnvPath, entries) {
  if (!githubEnvPath) {
    return
  }

  appendFileSync(
    githubEnvPath,
    Object.entries(entries)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    'utf8'
  )
}

// Deploys the Salesforce e2e LWC and generated static resources into the target org.
function deploySalesforceE2eApp({
  env = process.env,
  targetOrg = env.SF_ORG_ALIAS || 'engrumdev',
  waitMinutes = env.SF_DEPLOY_WAIT_MINUTES || '20',
} = {}) {
  runRequiredCommand(
    'sf',
    [
      'project',
      'deploy',
      'start',
      '--target-org',
      targetOrg,
      '--source-dir',
      'force-app/main/default/lwc/datadogInit',
      '--source-dir',
      'force-app/main/default/staticresources',
      '--wait',
      waitMinutes,
      '--ignore-conflicts',
      '--json',
    ],
    { cwd: salesforceAppDir }
  )
  cleanupGeneratedStaticResources()
}

// Removes generated static resource files from the local DX source after deploy.
function cleanupGeneratedStaticResources() {
  for (const fileName of readdirSync(staticResourcesDir)) {
    if (/^datadogRumSf_.*\.resource(-meta\.xml)?$/u.test(fileName)) {
      rmSync(join(staticResourcesDir, fileName))
    }
  }
}

// Deletes stale generated static resources from Salesforce while keeping the current run's resource.
async function cleanupStaticResources({
  env = process.env,
  targetOrg = env.SF_ORG_ALIAS || 'engrumdev',
  ttlHours = Number(env.DD_SALESFORCE_E2E_STATIC_RESOURCE_TTL_HOURS || DEFAULT_STATIC_RESOURCE_TTL_HOURS),
  dryRun = env.DD_SALESFORCE_E2E_CLEANUP_DRY_RUN === '1',
} = {}) {
  const currentResourceName = env.DD_SALESFORCE_E2E_STATIC_RESOURCE_NAME
  const cutoff = Date.now() - ttlHours * 60 * 60 * 1000
  const records = queryStaticResources(targetOrg)
  const staleRecords = records.filter((record) => {
    if (record.Name === currentResourceName) {
      return false
    }

    return new Date(record.CreatedDate).getTime() < cutoff
  })

  for (const record of staleRecords) {
    if (dryRun) {
      console.log(`Would delete stale Salesforce static resource ${record.Name} (${record.Id})`)
      continue
    }

    deleteStaticResource(targetOrg, record.Id)
    console.log(`Deleted stale Salesforce static resource ${record.Name} (${record.Id})`)
  }

  if (staleRecords.length === 0) {
    console.log(`No stale ${GENERATED_RESOURCE_PREFIX} static resources found`)
  }

  return staleRecords
}

// Queries Salesforce for generated static resources managed by this e2e flow.
function queryStaticResources(targetOrg) {
  const query =
    `SELECT Id, Name, CreatedDate FROM StaticResource ` +
    `WHERE Name LIKE '${GENERATED_RESOURCE_PREFIX}%' ORDER BY CreatedDate ASC`
  const result = runSfJson([
    'data',
    'query',
    '--target-org',
    targetOrg,
    '--use-tooling-api',
    '--query',
    query,
    '--json',
  ])

  return result.result?.records ?? []
}

// Deletes one generated static resource record from Salesforce by id.
function deleteStaticResource(targetOrg, recordId) {
  runSfJson([
    'data',
    'delete',
    'record',
    '--target-org',
    targetOrg,
    '--use-tooling-api',
    '--sobject',
    'StaticResource',
    '--record-id',
    recordId,
    '--json',
  ])
}

// Runs an sf CLI command and parses its JSON output.
function runSfJson(args) {
  const result = spawnSync('sf', args, {
    cwd: salesforceAppDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
    },
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || `sf ${args.join(' ')} exited with status ${result.status}`)
  }

  return JSON.parse(result.stdout)
}

// Runs a command that must succeed, throwing when it exits non-zero.
function runRequiredCommand(command, args, options) {
  const exitCode = runCommand(command, args, options)

  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${exitCode}`)
  }
}

// Runs a command and returns its exit status so Playwright failures can be reported normally.
function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    ...options,
    stdio: 'inherit',
    env: {
      ...process.env,
      NO_COLOR: '1',
    },
  })

  if (result.error) {
    throw result.error
  }

  return result.status ?? 1
}

// Removes Salesforce CLI state written under the local e2e DX app.
function cleanupSalesforceLocalState() {
  rmSync(resolve(salesforceAppDir, '.sf'), { recursive: true, force: true })
  rmSync(resolve(salesforceAppDir, '.sfdx'), { recursive: true, force: true })
}
