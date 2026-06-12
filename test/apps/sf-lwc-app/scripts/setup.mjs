import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const DATADOG_RESOURCE_NAME = 'datadog_rum_slim'
const GENERATED_RESOURCE_PREFIX = `${DATADOG_RESOURCE_NAME}_`
const DEFAULT_ORG_ALIAS = process.env.SF_ORG_ALIAS ?? 'engrumdev'

await authenticateSfCli()

const { deployApp, sfArgs } = getScriptArgs(process.argv.slice(2))
const targetSfArgs = withDefaultOrg(sfArgs)
const orgArgs = getOrgArgs(targetSfArgs)
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const browserSdkDir = resolve(appDir, '..', '..', '..')
const sourceBundle = resolve(browserSdkDir, 'packages/browser-rum-slim/bundle/datadog-rum-slim.js')
const defaultBundle = resolve(appDir, `force-app/main/default/staticresources/${DATADOG_RESOURCE_NAME}.js`)
const generatedDir = resolve(appDir, '.sf-e2e')

const resourceName = syncDatadogBundle()
if (deployApp) {
  deploySource(targetSfArgs)
}
deployGeneratedMetadata(resourceName)
writeFileSync(resolve(generatedDir, 'resource-name'), resourceName)
if (deployApp) {
  assignPermissionSet()
  printAppUrl(resourceName)
}
console.log(`Datadog RUM resource: ${resourceName}`)

// Keep the committed app deployable with the stable resource while exposing the same bundle
// under a content-hashed resource name for parallel E2E runs.
function syncDatadogBundle() {
  if (!existsSync(sourceBundle)) {
    throw new Error(
      `Missing Datadog RUM slim bundle at ${sourceBundle}. Run from a browser-sdk checkout with the bundle built.`
    )
  }

  const bundle = readFileSync(sourceBundle)
  const hash = createHash('sha256').update(bundle).digest('hex').slice(0, 12)
  const resourceName = `${GENERATED_RESOURCE_PREFIX}${hash}`

  copyFileSync(sourceBundle, defaultBundle)
  console.log(`Synced ${defaultBundle}`)

  return resourceName
}

// Salesforce lets us deploy a partial local source tree. Use it to deploy only the generated
// content-hashed static resource for this run without redeploying the whole app.
function deployGeneratedMetadata(resourceName) {
  rmSync(generatedDir, { recursive: true, force: true })

  const staticResourcesDir = resolve(generatedDir, 'force-app/main/default/staticresources')
  mkdirSync(staticResourcesDir, { recursive: true })

  copyFileSync(sourceBundle, resolve(staticResourcesDir, `${resourceName}.js`))
  writeFileSync(resolve(staticResourcesDir, `${resourceName}.resource-meta.xml`), buildStaticResourceMetadata())

  deploySource(['--source-dir', resolve(generatedDir, 'force-app'), ...targetSfArgs])
}

function deploySource(deployArgs) {
  run('sf', ['project', 'deploy', 'start', ...deployArgs], { cwd: appDir })
}

function buildStaticResourceMetadata() {
  return `<?xml version="1.0" encoding="UTF-8" ?>
<StaticResource xmlns="http://soap.sforce.com/2006/04/metadata">
    <cacheControl>Private</cacheControl>
    <contentType>application/javascript</contentType>
</StaticResource>
`
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function assignPermissionSet() {
  const result = spawnSync('sf', ['org', 'assign', 'permset', '-n', 'SF_LWC_App', ...orgArgs], {
    encoding: 'utf8',
    cwd: appDir,
  })

  if (result.status === 0) {
    console.log('Assigned SF_LWC_App permission set')
    return
  }

  const output = `${result.stdout}\n${result.stderr}`
  if (output.includes('Duplicate PermissionSetAssignment')) {
    console.log('SF_LWC_App permission set already assigned')
    return
  }

  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

function printAppUrl(resourceName) {
  const result = spawnSync(
    'sf',
    [
      'org',
      'open',
      '-p',
      `/lightning/app/c__SF_LWC_App/page/home?c__datadogResourceName=${resourceName}`,
      '--url-only',
      '--json',
      ...orgArgs,
    ],
    {
      encoding: 'utf8',
      cwd: appDir,
    }
  )

  if (result.status !== 0) {
    process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }

  const { result: openResult } = JSON.parse(result.stdout)
  console.log(`Home: ${openResult.url}`)
}

function getScriptArgs(args) {
  const sfArgs = []
  let deployApp = false

  for (const arg of args) {
    if (arg === '--deploy-app') {
      deployApp = true
    } else {
      sfArgs.push(arg)
    }
  }

  return { deployApp, sfArgs }
}

function withDefaultOrg(args) {
  if (getOrgArgs(args).length > 0) {
    return args
  }
  return [...args, '-o', DEFAULT_ORG_ALIAS]
}

async function authenticateSfCli() {
  const { SF_INSTANCE_URL, SF_CLIENT_ID, SF_CLIENT_SECRET } = process.env
  if (!SF_INSTANCE_URL || !SF_CLIENT_ID || !SF_CLIENT_SECRET) {
    return
  }

  const response = await fetch(`${SF_INSTANCE_URL}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: SF_CLIENT_ID,
      client_secret: SF_CLIENT_SECRET,
    }),
  })

  const data = await response.json()
  if (!response.ok || !data.access_token) {
    throw new Error(`SF client credentials exchange failed: ${data.error_description ?? 'unknown error'}`)
  }

  const instanceUrl = data.instance_url ?? SF_INSTANCE_URL
  run('sf', [
    'org',
    'login',
    'access-token',
    '--instance-url',
    instanceUrl,
    '--access-token',
    data.access_token,
    '--alias',
    DEFAULT_ORG_ALIAS,
    '--no-prompt',
  ])

  console.log(`Authenticated SF CLI as ${DEFAULT_ORG_ALIAS} via client credentials`)
}

function getOrgArgs(args) {
  const orgArgs = []

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if ((arg === '-o' || arg === '--target-org') && args[index + 1]) {
      orgArgs.push(arg, args[index + 1])
      index += 1
    } else if (arg.startsWith('--target-org=')) {
      orgArgs.push(arg)
    }
  }

  return orgArgs
}
