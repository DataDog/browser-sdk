import { createSign } from 'node:crypto'
import type { BrowserContextOptions } from '@playwright/test'

import {
  getSfLwcClientId,
  getSfLwcInstanceUrl,
  getSfLwcJwtPrivateKey,
  getSfLwcUsername,
} from '../../../../scripts/lib/secrets.ts'

const salesforceHomePath = '/lightning/app/c__SF_LWC_App/page/home'

let salesforceLwcSession: Promise<SalesforceLwcSession> | undefined

export interface SalesforceLwcSession {
  instanceUrl: string
  accessToken: string
}

export async function buildSalesforceLwcUrl(): Promise<string> {
  const { instanceUrl } = await getSalesforceLwcSession()
  return new URL(salesforceHomePath, instanceUrl).href
}

export async function buildSalesforceLwcStorageState(): Promise<NonNullable<BrowserContextOptions['storageState']>> {
  const { accessToken, instanceUrl } = await getSalesforceLwcSession()
  const instance = new URL(instanceUrl)
  return {
    cookies: [
      {
        name: 'sid',
        value: accessToken,
        domain: instance.hostname,
        path: '/',
        expires: -1,
        httpOnly: true,
        secure: instance.protocol === 'https:',
        sameSite: 'Lax',
      },
    ],
    origins: [],
  }
}

export function getSalesforceLwcSession(): Promise<SalesforceLwcSession> {
  salesforceLwcSession ??= buildSalesforceLwcJwtSession()
  return salesforceLwcSession
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
      // JWT expiry is set to 3 minutes, enough to complete the token exchange.
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
