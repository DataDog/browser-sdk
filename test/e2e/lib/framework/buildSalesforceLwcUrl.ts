import { createSign } from 'node:crypto'

import {
  getSfLwcClientId,
  getSfLwcInstanceUrl,
  getSfLwcJwtPrivateKey,
  getSfLwcUsername,
} from '../../../../scripts/lib/secrets.ts'

const salesforceHomePath = '/lightning/app/c__SF_LWC_App/page/home'

// The frontdoor.jsp OTP expires in ~1 minute, so the URL must be generated at test time —
// not at suite startup — to guarantee a valid token when the test actually navigates.
// This functions is similar to the one in scripts/salesforce-lwc-app.ts, but it is not using the sf CLI so we can call it at test time.
export async function buildSalesforceLwcUrl(): Promise<string> {
  const instanceUrl = getSfLwcInstanceUrl()
  const privateKey = Buffer.from(getSfLwcJwtPrivateKey(), 'base64').toString('utf8')
  const accessToken = await getAccessToken(getSfLwcClientId(), getSfLwcUsername(), instanceUrl, privateKey)

  const path = new URL(salesforceHomePath, 'https://salesforce.local')

  const response = await fetch(`${instanceUrl}/services/oauth2/singleaccess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      access_token: accessToken,
      redirect_uri: `${path.pathname}${path.search}`,
    }),
  })

  if (!response.ok) {
    throw new Error(`UI Bridge API failed (${response.status}): ${await response.text()}`)
  }

  const json = (await response.json()) as Record<string, string>
  const frontdoorUri = json['frontdoor_uri']
  if (!frontdoorUri) {
    throw new Error('UI Bridge API response missing frontdoor_uri')
  }
  return frontdoorUri
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
