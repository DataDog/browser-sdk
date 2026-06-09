import { test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { getSfSession, buildFrontdoorUrl } from './sfAuth.ts'
import { SfRegistry, type BridgeEvent } from './sfRegistry.ts'

export interface SfTestContext {
  page: Page
  sfRegistry: SfRegistry
  instanceUrl: string
  waitFor: (condition: () => boolean, timeout?: number, message?: string) => Promise<void>
}

type SfTestRunner = (ctx: SfTestContext) => Promise<void> | void

class SalesforceTestBuilder {
  private path = '/lightning/page/home'

  constructor(private title: string) {}

  withPath(path: string) {
    this.path = path
    return this
  }

  run(runner: SfTestRunner) {
    const { title, path } = this

    test(title, async ({ page }) => {
      const sfRegistry = new SfRegistry()
      const session = getSfSession()
      const bundleConfig = getSalesforceBundleConfig()

      await page.exposeFunction('__ddSfOnBridgeEvent', (event: BridgeEvent) => sfRegistry.add(event))
      await page.addInitScript('window.__ddBrowserSdkExtensionCallback = (msg) => __ddSfOnBridgeEvent(msg)')
      await page.goto(buildFrontdoorUrl(session, addBundleConfigToUrl(path, bundleConfig)))
      await page.waitForLoadState('load')

      if (bundleConfig) {
        await waitFor(
          () => sfRegistry.rumEvents.some((e) => e.version === bundleConfig.sha),
          30000,
          `Timed out waiting for Salesforce RUM version ${bundleConfig.sha}`
        )
      }

      await runner({
        page,
        sfRegistry,
        instanceUrl: session.instanceUrl,
        waitFor,
      })
    })
  }
}

export function createSalesforceTest(title: string) {
  return new SalesforceTestBuilder(title)
}

function getSalesforceBundleConfig() {
  const resourceName = process.env.DD_SALESFORCE_E2E_STATIC_RESOURCE_NAME
  const sha = process.env.DD_SALESFORCE_E2E_SHA

  return resourceName && sha ? { resourceName, sha } : undefined
}

function addBundleConfigToUrl(path: string, bundleConfig: { resourceName: string; sha: string } | undefined) {
  if (!bundleConfig) {
    return path
  }

  const url = new URL(path, 'https://salesforce.local')
  const hashParameters = new URLSearchParams(url.hash.replace(/^#/u, ''))
  hashParameters.set('dd_sf_e2e', `${bundleConfig.resourceName}:${bundleConfig.sha}`)
  url.hash = hashParameters.toString()

  return `${url.pathname}${url.search}${url.hash}`
}

async function waitFor(condition: () => boolean, timeout = 15000, message = 'Timed out waiting for condition') {
  const deadline = Date.now() + timeout
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(message)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
