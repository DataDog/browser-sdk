import { createSign } from 'node:crypto'
import { execFileSync } from 'node:child_process'

import {
  getSfLwcClientId,
  getSfLwcInstanceUrl,
  getSfLwcJwtPrivateKey,
  getSfLwcUsername,
} from '../../../../scripts/lib/secrets.ts'

const salesforceHomePath = '/lightning/app/c__SF_LWC_App/page/home'

interface SalesforceLwcSession {
  instanceUrl: string
  accessToken: string
}

let salesforceLwcSession: Promise<SalesforceLwcSession> | undefined

// The session is fetched once per test run and reused across tests to avoid re-authenticating
// (JWT or CLI) for every test.
export function getSalesforceLwcSession(): Promise<SalesforceLwcSession> {
  salesforceLwcSession ??= buildSalesforceLwcSession()
  return salesforceLwcSession
}

export async function buildSalesforceLwcUrl(): Promise<string> {
  const { instanceUrl } = await getSalesforceLwcSession()
  return new URL(salesforceHomePath, instanceUrl).href
}

async function buildSalesforceLwcSession(): Promise<SalesforceLwcSession> {
  try {
    return await buildSalesforceLwcJwtSession()
  } catch (error) {
    const cliSession = buildSalesforceLwcCliSession()
    if (cliSession) {
      return cliSession
    }
    throw error
  }
}

async function buildSalesforceLwcJwtSession(): Promise<SalesforceLwcSession> {
  const clientId = getSfLwcClientId()
  const instanceUrl = getSfLwcInstanceUrl()
  const jwtPrivateKey = getSfLwcJwtPrivateKey()
  const username = getSfLwcUsername()

  if (!clientId || !instanceUrl || !jwtPrivateKey || !username) {
    throw new Error('Salesforce credentials are not set')
  }

  const privateKey = Buffer.from(jwtPrivateKey, 'base64').toString('utf8')
  const accessToken = await getAccessToken(clientId, username, instanceUrl, privateKey)
  return { instanceUrl, accessToken }
}

// Fallback for local development: reuse the `sf` CLI session already authenticated via
// `yarn salesforce:deploy-app` / `yarn salesforce:get-url`, instead of requiring JWT credentials.
function buildSalesforceLwcCliSession(): SalesforceLwcSession | undefined {
  const alias = process.env.SF_ORG_ALIAS ?? 'sf-lwc-ci'

  try {
    const accessTokenOutput = execFileSync(
      'sf',
      ['org', 'auth', 'show-access-token', '--target-org', alias, '--json'],
      {
        encoding: 'utf8',
      }
    )
    const orgDisplayOutput = execFileSync('sf', ['org', 'display', '--target-org', alias, '--json'], {
      encoding: 'utf8',
    })
    const accessTokenJson = JSON.parse(accessTokenOutput) as { result: { accessToken: string } }
    const orgDisplayJson = JSON.parse(orgDisplayOutput) as { result: { instanceUrl: string } }
    return {
      accessToken: accessTokenJson.result.accessToken,
      instanceUrl: orgDisplayJson.result.instanceUrl,
    }
  } catch {
    return undefined
  }
}

async function getAccessToken(
  clientId: string,
  username: string,
  instanceUrl: string,
  privateKey: string
): Promise<string> {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      iss: clientId,
      sub: username,
      aud: instanceUrl,
      // JWT expiry is set to 3 minutes — enough to complete the token exchange.
      exp: Math.floor(Date.now() / 1000) + 180,
    })
  ).toString('base64url')

  const sign = createSign('RSA-SHA256')
  sign.update(`${header}.${payload}`)
  const jwt = `${header}.${payload}.${sign.sign(privateKey, 'base64url')}`

  const response = await fetch(`${instanceUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!response.ok) {
    throw new Error(`Salesforce token request failed (${response.status}): ${await response.text()}`)
  }

  const json = (await response.json()) as Record<string, string>
  const accessToken = json['access_token']
  if (!accessToken) {
    throw new Error('Salesforce token response missing access_token')
  }
  return accessToken
}
