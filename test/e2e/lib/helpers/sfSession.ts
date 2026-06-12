import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DEFAULT_RUM_CONFIGURATION } from './configuration'

const orgAlias = process.env.SF_ORG_ALIAS ?? 'engrumdev'

async function getSfSession(): Promise<{ instanceUrl: string; accessToken: string }> {
  const { SF_INSTANCE_URL, SF_CLIENT_ID, SF_CLIENT_SECRET } = process.env

  if (SF_INSTANCE_URL && SF_CLIENT_ID && SF_CLIENT_SECRET) {
    return await getSessionFromClientCredentials(SF_INSTANCE_URL, SF_CLIENT_ID, SF_CLIENT_SECRET)
  }

  return getSessionFromCli()
}

async function getSessionFromClientCredentials(instanceUrl: string, clientId: string, clientSecret: string) {
  const response = await fetch(`${instanceUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  })

  const data = (await response.json()) as { access_token?: string; instance_url?: string; error_description?: string }

  if (!response.ok || !data.access_token) {
    throw new Error(`SF client credentials exchange failed: ${data.error_description ?? 'unknown error'}`)
  }

  return {
    instanceUrl: data.instance_url ?? instanceUrl,
    accessToken: data.access_token,
  }
}

function getSessionFromCli() {
  const { status, stdout, stderr } = spawnSync('sf', ['org', 'display', '-o', orgAlias, '--json'], {
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
  })

  if (status !== 0) {
    throw new Error(
      `Could not get SF session for org '${orgAlias}'. Run 'sf org display -o ${orgAlias}' to diagnose.\n${stderr}`
    )
  }

  const result = JSON.parse(stdout).result
  if (!result?.instanceUrl || !result?.accessToken) {
    throw new Error(
      `Could not get SF session for org '${orgAlias}'. ` +
        'Set SF_INSTANCE_URL + SF_CLIENT_ID + SF_CLIENT_SECRET for CI, or authenticate with the Salesforce CLI locally.'
    )
  }

  return {
    instanceUrl: result.instanceUrl as string,
    accessToken: result.accessToken as string,
  }
}

function getResourceName(): string {
  const filePath = resolve(__dirname, '../../../apps/sf-lwc-app/.sf-e2e/resource-name')
  if (existsSync(filePath)) {
    return readFileSync(filePath, 'utf-8').trim()
  }
  throw new Error('SF LWC resource name not found. Run yarn build:apps --app sf-lwc-app first.')
}

function buildSfLwcRetPath() {
  const homePath = '/lightning/app/c__SF_LWC_App/page/home'

  const path = new URL(homePath, 'https://salesforce.test')
  path.searchParams.set('c__datadogResourceName', getResourceName())
  path.searchParams.set(
    'c__datadogInitConfiguration',
    JSON.stringify({
      ...DEFAULT_RUM_CONFIGURATION,
      service: 'browser-sdk-salesforce-e2e',
      env: 'e2e',
    })
  )
  return `${path.pathname}${path.search}`
}

export async function buildFrontdoorUrl(): Promise<string> {
  const { instanceUrl, accessToken } = await getSfSession()
  const base = instanceUrl.replace(/\/+$/, '')
  return `${base}/secur/frontdoor.jsp?sid=${accessToken}&retURL=${encodeURIComponent(buildSfLwcRetPath())}`
}
