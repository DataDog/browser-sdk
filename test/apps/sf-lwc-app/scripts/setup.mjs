import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash, createSign } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = resolve(appDir, '..', '..', '..', 'packages/browser-rum-slim/bundle/datadog-rum-slim.js')
const resourceDir = resolve(appDir, '.sf-e2e')

const { deployApp, sfArgs } = parseArgs()
const { instanceUrl, accessToken } = await getAuth()
const resourceName = computeResourceName()
await uploadBundle(instanceUrl, accessToken, resourceName)
saveResourceName(resourceName)
if (deployApp) deployLwcApp(instanceUrl, sfArgs)

function computeResourceName() {
  const hash = createHash('sha256').update(readFileSync(bundlePath)).digest('hex').slice(0, 12)
  return `datadog_rum_slim_${hash}`
}

async function uploadBundle(instanceUrl, accessToken, resourceName) {
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  const api = `${instanceUrl}/services/data/v62.0/tooling`
  const bodyB64 = readFileSync(bundlePath).toString('base64')

  const { records } = await (
    await fetch(`${api}/query?q=${encodeURIComponent(`SELECT Id FROM StaticResource WHERE Name='${resourceName}'`)}`, {
      headers,
    })
  ).json()
  const existingId = records?.[0]?.Id

  const response = await fetch(
    existingId ? `${api}/sobjects/StaticResource/${existingId}` : `${api}/sobjects/StaticResource`,
    {
      method: existingId ? 'PATCH' : 'POST',
      headers,
      body: JSON.stringify(
        existingId
          ? { Body: bodyB64 }
          : { Name: resourceName, ContentType: 'application/javascript', CacheControl: 'Private', Body: bodyB64 }
      ),
    }
  )
  if (!response.ok && response.status !== 204) {
    throw new Error(`Failed to upload '${resourceName}': ${await response.text()}`)
  }
  console.log(`Static resource deployed: ${resourceName}`)
}

function saveResourceName(resourceName) {
  rmSync(resourceDir, { recursive: true, force: true })
  mkdirSync(resourceDir)
  writeFileSync(resolve(resourceDir, 'resource-name'), resourceName)
}

async function getAuth() {
  const { SF_INSTANCE_URL, SF_CLIENT_ID, SF_JWT_PRIVATE_KEY, SF_RUN_AS_USER } = process.env
  if (!SF_INSTANCE_URL || !SF_CLIENT_ID || !SF_JWT_PRIVATE_KEY || !SF_RUN_AS_USER) {
    throw new Error('Missing: SF_INSTANCE_URL, SF_CLIENT_ID, SF_JWT_PRIVATE_KEY, SF_RUN_AS_USER')
  }
  const base = SF_INSTANCE_URL.replace(/\/+$/, '')
  const loginUrl = base.includes('.sandbox.') ? 'https://test.salesforce.com' : 'https://login.salesforce.com'
  const response = await fetch(`${base}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: buildJwt(loginUrl, SF_CLIENT_ID, SF_RUN_AS_USER, SF_JWT_PRIVATE_KEY),
    }),
  })
  const data = await response.json()
  if (!response.ok || !data.access_token) {
    throw new Error(`SF auth failed: ${data.error_description ?? 'unknown error'}`)
  }
  return { instanceUrl: (data.instance_url ?? base).replace(/\/+$/, ''), accessToken: data.access_token }
}

function buildJwt(audience, clientId, subject, privateKey) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({ iss: clientId, sub: subject, aud: audience, exp: Math.floor(Date.now() / 1000) + 300 })
  ).toString('base64url')
  const sig = createSign('SHA256')
    .update(`${header}.${payload}`)
    .sign(privateKey.replace(/\\n/g, '\n'), 'base64url')
  return `${header}.${payload}.${sig}`
}

function deployLwcApp(instanceUrl, sfArgs) {
  copyFileSync(bundlePath, resolve(appDir, 'force-app/main/default/staticresources/datadog_rum_slim.js'))
  const org = sfArgs.length ? sfArgs : ['-o', instanceUrl]
  run('sf', ['project', 'deploy', 'start', ...org])
  const result = spawnSync('sf', ['org', 'assign', 'permset', '-n', 'SF_LWC_App', '-o', instanceUrl], {
    encoding: 'utf8',
    cwd: appDir,
  })
  if (result.status !== 0 && !`${result.stdout}${result.stderr}`.includes('Duplicate PermissionSetAssignment')) {
    process.stdout.write(result.stdout)
    process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: appDir })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function parseArgs() {
  const sfArgs = []
  let deployApp = false
  for (const arg of process.argv.slice(2)) {
    if (arg === '--deploy-app') deployApp = true
    else sfArgs.push(arg)
  }
  return { deployApp, sfArgs }
}
