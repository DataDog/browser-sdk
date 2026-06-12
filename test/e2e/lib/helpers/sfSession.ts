import { createSign } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getSfClientId, getSfInstanceUrl, getSfJwtPrivateKey, getSfRunAsUser } from '../../../../scripts/lib/secrets'
import { DEFAULT_RUM_CONFIGURATION } from './configuration'

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

function buildJwt(audience: string, clientId: string, subject: string, privateKey: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      iss: clientId,
      sub: subject,
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 300,
    })
  ).toString('base64url')
  const sig = createSign('SHA256').update(`${header}.${payload}`).sign(privateKey, 'base64url')
  return `${header}.${payload}.${sig}`
}

export async function buildFrontdoorUrl(): Promise<string> {
  const instanceUrl = getSfInstanceUrl().replace(/\/+$/, '')
  const loginUrl = instanceUrl.includes('.sandbox.') ? 'https://test.salesforce.com' : 'https://login.salesforce.com'

  const jwt = buildJwt(loginUrl, getSfClientId(), getSfRunAsUser(), getSfJwtPrivateKey())
  const tokenResponse = await fetch(`${instanceUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const tokenData = (await tokenResponse.json()) as {
    access_token?: string
    instance_url?: string
    error_description?: string
  }
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(`SF JWT bearer exchange failed: ${tokenData.error_description ?? 'unknown error'}`)
  }

  const authorizedInstanceUrl = (tokenData.instance_url ?? instanceUrl).replace(/\/+$/, '')
  return `${authorizedInstanceUrl}/secur/frontdoor.jsp?sid=${tokenData.access_token}&retURL=${encodeURIComponent(buildSfLwcRetPath())}`
}
