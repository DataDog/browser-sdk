import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { createEventIntakeRequestFromPayload } from '../intakeProxyMiddleware.ts'
import type { Servers } from '../httpServers.ts'
import type { IntakeRegistry } from '../intakeRegistry.ts'
import { buildFrontdoorUrl, type SfSession } from './sfAuth.ts'
import { ensureSalesforceTrustedUrl } from './sfTrustedUrls.ts'

const SALESFORCE_E2E_CONFIG_PATH = join(process.cwd(), 'test/e2e/salesforce-app/.e2e-config.json')
const SALESFORCE_E2E_HASH_PARAMETER = 'dd_sf_e2e'

export interface SalesforceE2eConfig {
  resourceName: string
  sha: string
}

export function getSalesforceE2eConfig(): SalesforceE2eConfig {
  const envConfig = getSalesforceE2eConfigFromEnv()
  if (envConfig) {
    return envConfig
  }

  try {
    const config = JSON.parse(readFileSync(SALESFORCE_E2E_CONFIG_PATH, 'utf8')) as Partial<SalesforceE2eConfig>
    if (config.resourceName && config.sha) {
      return {
        resourceName: config.resourceName,
        sha: config.sha,
      }
    }
  } catch {
    // Fall through to the actionable error below.
  }

  throw new Error(
    'Could not find Salesforce E2E bundle config. Run "yarn build:apps --app salesforce" first, ' +
      'or set DD_SALESFORCE_E2E_STATIC_RESOURCE_NAME and DD_SALESFORCE_E2E_SHA.'
  )
}

export async function goToSalesforcePage({
  page,
  session,
  servers,
  intakeRegistry,
  path,
  config,
}: {
  page: Page
  session: SfSession
  servers: Servers
  intakeRegistry: IntakeRegistry
  path: string
  config: SalesforceE2eConfig
}) {
  const proxy = getLocalhostOrigin(servers.intake.origin)
  const retPath = addSalesforceE2eConfigToUrl(path, { ...config, proxy })

  await routeSalesforceIntakeRequests(page, proxy, intakeRegistry)
  await ensureSalesforceTrustedUrl(session, proxy)
  await page.goto(buildFrontdoorUrl(session, retPath))
  await page.waitForLoadState('load')
}

async function routeSalesforceIntakeRequests(page: Page, proxy: string, intakeRegistry: IntakeRegistry) {
  await page.route(`${proxy}/**`, async (route) => {
    const request = route.request()

    if (request.method() === 'OPTIONS') {
      await fulfillIntakeRoute(route, 204)
      return
    }

    try {
      const body = request.postDataBuffer() ?? Buffer.alloc(0)
      intakeRegistry.push(
        createEventIntakeRequestFromPayload({
          url: request.url(),
          headers: request.headers(),
          body,
        })
      )
      await fulfillIntakeRoute(route, 200)
    } catch (error) {
      console.error('Error while processing Salesforce intake request:', error)
      await fulfillIntakeRoute(route, 500)
    }
  })
}

async function fulfillIntakeRoute(route: Parameters<Parameters<Page['route']>[1]>[0], status: number) {
  await route.fulfill({
    status,
    body: '',
    headers: {
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-origin': '*',
      'access-control-allow-private-network': 'true',
    },
  })
}

function getSalesforceE2eConfigFromEnv(): SalesforceE2eConfig | undefined {
  const resourceName = process.env.DD_SALESFORCE_E2E_STATIC_RESOURCE_NAME
  const sha = process.env.DD_SALESFORCE_E2E_SHA

  return resourceName && sha ? { resourceName, sha } : undefined
}

function getLocalhostOrigin(origin: string) {
  const url = new URL(origin)
  url.hostname = 'localhost'
  return url.origin
}

function addSalesforceE2eConfigToUrl(
  path: string,
  config: SalesforceE2eConfig & {
    proxy: string
  }
) {
  const url = new URL(path, 'https://salesforce.local')
  const hashParameters = new URLSearchParams(url.hash.replace(/^#/u, ''))
  hashParameters.set(SALESFORCE_E2E_HASH_PARAMETER, JSON.stringify(config))
  url.hash = hashParameters.toString()

  return `${url.pathname}${url.search}${url.hash}`
}
