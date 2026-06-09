import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { command } from '../../lib/command.ts'
import { printLog } from '../../lib/executionUtils.ts'

const GENERATED_RESOURCE_PREFIX = 'datadogRumSf'
const STATIC_RESOURCE_NAME_PATTERN = /^[A-Za-z](?:[A-Za-z0-9_]*[A-Za-z0-9])?$/
const STATIC_RESOURCE_NAME_MAX_LENGTH = 80
const DEFAULT_STATIC_RESOURCE_TTL_HOURS = 24

const scriptDir = dirname(fileURLToPath(import.meta.url))
const browserSdkRoot = resolve(scriptDir, '../../..')
const salesforceAppDir = resolve(browserSdkRoot, 'test/e2e/salesforce-app')
const staticResourcesDir = resolve(salesforceAppDir, 'force-app/main/default/staticresources')
const salesforceE2eConfigPath = resolve(salesforceAppDir, '.e2e-config.json')
const sourceBundle = resolve(browserSdkRoot, 'packages/browser-rum-slim/bundle/datadog-rum-slim.js')

interface StaticResourceRecord {
  Id: string
  Name: string
  CreatedDate: string
}

export function buildSalesforceTestApp() {
  process.env.SF_ORG_ALIAS ||= 'engrumdev'

  try {
    const { resourceName, sha } = prepareStaticResource()
    process.env.DD_SALESFORCE_E2E_STATIC_RESOURCE_NAME = resourceName
    process.env.DD_SALESFORCE_E2E_SHA = sha

    deploySalesforceE2eApp()
    writeSalesforceE2eConfig({ resourceName, sha })
    writeGithubEnv({ DD_SALESFORCE_E2E_STATIC_RESOURCE_NAME: resourceName, DD_SALESFORCE_E2E_SHA: sha })
    cleanupStaticResources()
  } finally {
    cleanupGeneratedStaticResources()
    cleanupSalesforceLocalState()
  }
}

function prepareStaticResource() {
  const sha = process.env.DD_SALESFORCE_E2E_SHA || process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA || 'local'
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

  printLog(`DD_SALESFORCE_E2E_STATIC_RESOURCE_NAME=${resourceName}`)
  printLog(`DD_SALESFORCE_E2E_SHA=${sha}`)
  printLog(`Generated ${resourcePath}`)

  return { resourceName, sha }
}

function buildGeneratedResourceName(sha: string) {
  const runId = sanitizeNamePart(process.env.GITHUB_RUN_ID || process.env.CI_JOB_ID || process.env.BUILD_ID || 'local')
  const runAttempt = sanitizeNamePart(
    process.env.GITHUB_RUN_ATTEMPT || process.env.CI_JOB_ATTEMPT || process.env.BUILD_ATTEMPT || '1'
  )
  const shaPart = sanitizeNamePart(sha).slice(0, 12) || 'local'
  const localPart =
    process.env.GITHUB_RUN_ID || process.env.CI_JOB_ID || process.env.BUILD_ID ? undefined : Date.now().toString(36)

  return [GENERATED_RESOURCE_PREFIX, runId, runAttempt, shaPart, localPart]
    .filter(Boolean)
    .join('_')
    .slice(0, STATIC_RESOURCE_NAME_MAX_LENGTH)
    .replace(/_+$/u, '')
}

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

function buildStaticResourceMetadata() {
  return `<?xml version="1.0" encoding="UTF-8" ?>
<StaticResource xmlns="http://soap.sforce.com/2006/04/metadata">
    <cacheControl>Private</cacheControl>
    <contentType>application/javascript</contentType>
</StaticResource>
`
}

function sanitizeNamePart(value: string) {
  return String(value)
    .replace(/[^A-Za-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
}

function deploySalesforceE2eApp() {
  const targetOrg = process.env.SF_ORG_ALIAS || 'engrumdev'
  const waitMinutes = process.env.SF_DEPLOY_WAIT_MINUTES || '10'

  try {
    command`sf project deploy start --target-org ${targetOrg} --source-dir force-app/main/default/lwc/datadogInit --source-dir force-app/main/default/staticresources --wait ${waitMinutes} --ignore-conflicts --json`
      .withCurrentWorkingDirectory(salesforceAppDir)
      .run()
  } catch (error) {
    const deployId = getDeployIdFromError(error)
    if (deployId && isDeploySucceeded(targetOrg, deployId)) {
      printLog(`Salesforce deploy ${deployId} succeeded despite CLI exit failure`)
      return
    }

    throw error
  }
}

function getDeployIdFromError(error: unknown) {
  const match = String(error).match(/"id":\s*"(?<id>0Af[^"]+)"/u)
  return match?.groups?.id
}

function isDeploySucceeded(targetOrg: string, deployId: string) {
  const result = JSON.parse(
    command`sf project deploy report --target-org ${targetOrg} --job-id ${deployId} --json`
      .withCurrentWorkingDirectory(salesforceAppDir)
      .run()
  ) as { result?: { success?: boolean; status?: string } }

  return result.result?.success === true && result.result.status === 'Succeeded'
}

function writeSalesforceE2eConfig(config: { resourceName: string; sha: string }) {
  writeFileSync(salesforceE2eConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  printLog(`Wrote ${salesforceE2eConfigPath}`)
}

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

function cleanupGeneratedStaticResources() {
  if (!existsSync(staticResourcesDir)) {
    return
  }

  for (const fileName of readdirSync(staticResourcesDir)) {
    if (/^datadogRumSf_.*\.resource(-meta\.xml)?$/u.test(fileName)) {
      rmSync(join(staticResourcesDir, fileName))
    }
  }
}

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
}

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

function deleteStaticResource(targetOrg: string, recordId: string) {
  command`sf data delete record --target-org ${targetOrg} --use-tooling-api --sobject StaticResource --record-id ${recordId} --json`
    .withCurrentWorkingDirectory(salesforceAppDir)
    .run()
}

function cleanupSalesforceLocalState() {
  rmSync(resolve(salesforceAppDir, '.sf'), { recursive: true, force: true })
  rmSync(resolve(salesforceAppDir, '.sfdx'), { recursive: true, force: true })
}
