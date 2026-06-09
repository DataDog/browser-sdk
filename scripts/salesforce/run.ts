import { spawnSync } from 'node:child_process'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { command } from '../lib/command.ts'
import { printLog, runMain } from '../lib/executionUtils.ts'

const GENERATED_RESOURCE_PREFIX = 'datadogRumSf'
const STATIC_RESOURCE_NAME_PATTERN = /^[A-Za-z](?:[A-Za-z0-9_]*[A-Za-z0-9])?$/
const STATIC_RESOURCE_NAME_MAX_LENGTH = 80
const DEFAULT_STATIC_RESOURCE_TTL_HOURS = 24
const SKIP_DEPLOY_FLAG = '--skip-deploy'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const browserSdkRoot = resolve(scriptDir, '../..')
const salesforceAppDir = resolve(browserSdkRoot, 'test/e2e/salesforce-app')
const staticResourcesDir = resolve(salesforceAppDir, 'force-app/main/default/staticresources')
const sourceBundle = resolve(browserSdkRoot, 'packages/browser-rum-slim/bundle/datadog-rum-slim.js')

interface StaticResourceRecord {
  Id: string
  Name: string
  CreatedDate: string
}

runMain(() => {
  const args = process.argv.slice(2)
  const skipDeploy = args.includes(SKIP_DEPLOY_FLAG)
  const playwrightArgs = args.filter((arg) => arg !== SKIP_DEPLOY_FLAG)

  process.env.SF_ORG_ALIAS ||= 'engrumdev'

  let exitCode: number | undefined

  try {
    if (!skipDeploy) {
      const { resourceName, sha } = prepareStaticResource()
      process.env.DD_SALESFORCE_E2E_STATIC_RESOURCE_NAME = resourceName
      process.env.DD_SALESFORCE_E2E_SHA = sha
      deploySalesforceE2eApp()
    }

    exitCode = runPlaywright(playwrightArgs)
  } finally {
    try {
      cleanupStaticResources()
    } finally {
      cleanupSalesforceLocalState()
    }
  }

  if (exitCode !== undefined && exitCode !== 0) {
    process.exit(exitCode)
  }
})

// Builds the RUM slim bundle and writes it as a generated Salesforce static resource.
function prepareStaticResource() {
  const sha = process.env.DD_SALESFORCE_E2E_SHA || process.env.GITHUB_SHA || 'local'
  const resourceName = validateStaticResourceName(
    process.env.DD_SALESFORCE_E2E_STATIC_RESOURCE_NAME || buildGeneratedResourceName(sha)
  )

  if (process.env.SKIP_BUNDLE_BUILD !== '1') {
    command`yarn workspace @datadog/browser-rum-slim build:bundle`
      .withCurrentWorkingDirectory(browserSdkRoot)
      .withLogs()
      .run()
  }

  if (!existsSync(sourceBundle)) {
    throw new Error(`Salesforce RUM bundle not found: ${sourceBundle}`)
  }

  mkdirSync(staticResourcesDir, { recursive: true })

  const resourcePath = resolve(staticResourcesDir, `${resourceName}.resource`)
  const metadataPath = resolve(staticResourcesDir, `${resourceName}.resource-meta.xml`)

  copyFileSync(sourceBundle, resourcePath)
  writeFileSync(metadataPath, buildStaticResourceMetadata(), 'utf8')
  writeGithubEnv({ DD_SALESFORCE_E2E_STATIC_RESOURCE_NAME: resourceName, DD_SALESFORCE_E2E_SHA: sha })

  printLog(`DD_SALESFORCE_E2E_STATIC_RESOURCE_NAME=${resourceName}`)
  printLog(`DD_SALESFORCE_E2E_SHA=${sha}`)
  printLog(`Generated ${resourcePath}`)

  return { resourceName, sha, resourcePath, metadataPath }
}

// Creates a unique Salesforce-safe static resource name for this CI/local run.
function buildGeneratedResourceName(sha: string) {
  const runId = sanitizeNamePart(process.env.GITHUB_RUN_ID || process.env.BUILD_ID || 'local')
  const runAttempt = sanitizeNamePart(process.env.GITHUB_RUN_ATTEMPT || process.env.BUILD_ATTEMPT || '1')
  const shaPart = sanitizeNamePart(sha).slice(0, 12) || 'local'
  const localPart = process.env.GITHUB_RUN_ID || process.env.BUILD_ID ? undefined : Date.now().toString(36)

  return [GENERATED_RESOURCE_PREFIX, runId, runAttempt, shaPart, localPart]
    .filter(Boolean)
    .join('_')
    .slice(0, STATIC_RESOURCE_NAME_MAX_LENGTH)
    .replace(/_+$/u, '')
}

// Rejects names that Salesforce static resources cannot accept.
function validateStaticResourceName(resourceName: string) {
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
function sanitizeNamePart(value: string) {
  return String(value)
    .replace(/[^A-Za-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
}

// Writes generated resource values into GitHub Actions env when running in CI.
function writeGithubEnv(entries: Record<string, string>) {
  if (!process.env.GITHUB_ENV) {
    return
  }

  appendFileSync(
    process.env.GITHUB_ENV,
    `${Object.entries(entries)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`,
    'utf8'
  )
}

// Deploys the Salesforce e2e LWC and generated static resources into the target org.
function deploySalesforceE2eApp() {
  const targetOrg = process.env.SF_ORG_ALIAS || 'engrumdev'
  const waitMinutes = process.env.SF_DEPLOY_WAIT_MINUTES || '20'

  command`sf project deploy start --target-org ${targetOrg} --source-dir force-app/main/default/lwc/datadogInit --source-dir force-app/main/default/staticresources --wait ${waitMinutes} --ignore-conflicts --json`
    .withCurrentWorkingDirectory(salesforceAppDir)
    .run()

  cleanupGeneratedStaticResources()
}

// Runs the Playwright test suite and returns the exit code.
function runPlaywright(extraArgs: string[]) {
  const result = spawnSync(
    'playwright',
    ['test', '--config', 'test/e2e/playwright.salesforce.config.ts', ...extraArgs],
    { cwd: browserSdkRoot, stdio: 'inherit', env: { ...process.env, NO_COLOR: '1' } }
  )
  if (result.error) {
    throw result.error
  }
  return result.status ?? 1
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
function cleanupStaticResources() {
  const targetOrg = process.env.SF_ORG_ALIAS || 'engrumdev'
  const ttlHours = Number(process.env.DD_SALESFORCE_E2E_STATIC_RESOURCE_TTL_HOURS || DEFAULT_STATIC_RESOURCE_TTL_HOURS)
  const dryRun = process.env.DD_SALESFORCE_E2E_CLEANUP_DRY_RUN === '1'
  const currentResourceName = process.env.DD_SALESFORCE_E2E_STATIC_RESOURCE_NAME
  const cutoff = Date.now() - ttlHours * 60 * 60 * 1000

  const records = queryStaticResources(targetOrg)
  const staleRecords = records.filter(
    (record) => record.Name !== currentResourceName && new Date(record.CreatedDate).getTime() < cutoff
  )

  for (const record of staleRecords) {
    if (dryRun) {
      printLog(`Would delete stale Salesforce static resource ${record.Name} (${record.Id})`)
      continue
    }

    deleteStaticResource(targetOrg, record.Id)
    printLog(`Deleted stale Salesforce static resource ${record.Name} (${record.Id})`)
  }

  if (staleRecords.length === 0) {
    printLog(`No stale ${GENERATED_RESOURCE_PREFIX} static resources found`)
  }

  return staleRecords
}

// Queries Salesforce for generated static resources managed by this e2e flow.
function queryStaticResources(targetOrg: string): StaticResourceRecord[] {
  const query =
    'SELECT Id, Name, CreatedDate FROM StaticResource ' +
    `WHERE Name LIKE '${GENERATED_RESOURCE_PREFIX}%' ORDER BY CreatedDate ASC`

  const result = JSON.parse(
    command`sf data query --target-org ${targetOrg} --use-tooling-api --query ${query} --json`
      .withCurrentWorkingDirectory(salesforceAppDir)
      .run()
  ) as { result?: { records?: StaticResourceRecord[] } }

  return result.result?.records ?? []
}

// Deletes one generated static resource record from Salesforce by id.
function deleteStaticResource(targetOrg: string, recordId: string) {
  command`sf data delete record --target-org ${targetOrg} --use-tooling-api --sobject StaticResource --record-id ${recordId} --json`
    .withCurrentWorkingDirectory(salesforceAppDir)
    .run()
}

// Removes Salesforce CLI state written under the local e2e DX app.
function cleanupSalesforceLocalState() {
  rmSync(resolve(salesforceAppDir, '.sf'), { recursive: true, force: true })
  rmSync(resolve(salesforceAppDir, '.sfdx'), { recursive: true, force: true })
}
