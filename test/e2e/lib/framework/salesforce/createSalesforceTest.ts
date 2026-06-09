import { test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { getSfSession, buildFrontdoorUrl } from './sfAuth.ts'
import { SfRegistry, BridgeEvent } from './sfRegistry.ts'

export type RumEventType = 'view' | 'action' | 'error' | 'resource' | 'long_task'

export interface SfTestContext {
  page: Page
  sfRegistry: SfRegistry
  instanceUrl: string
  waitForRumEvent: (type: RumEventType, minCount?: number, timeout?: number) => Promise<void>
  waitForUniqueViews: (count: number, timeout?: number) => Promise<void>
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
      await page.addInitScript(`window.__ddBrowserSdkExtensionCallback = (msg) => __ddSfOnBridgeEvent(msg)`)
      await page.goto(buildFrontdoorUrl(session, addBundleConfigToUrl(path, bundleConfig)))
      await page.waitForLoadState('load')

      if (bundleConfig) {
        await waitFor(
          () => sfRegistry.rumEvents.some((e) => e.version === bundleConfig.sha),
          30000,
          `Timed out waiting for Salesforce RUM version ${bundleConfig.sha}`
        )
      }

      const waitForRumEvent = (type: RumEventType, minCount = 1, timeout = 15000) =>
        waitFor(
          () => sfRegistry.rumEvents.filter((e) => e.type === type).length >= minCount,
          timeout,
          `Timed out waiting for ${minCount} Salesforce ${type} events`
        )

      const waitForUniqueViews = (count: number, timeout = 20000) =>
        waitFor(
          () => sfRegistry.rumUniqueViewEvents.length >= count,
          timeout,
          `Timed out waiting for ${count} unique Salesforce views`
        )

      await runner({
        page,
        sfRegistry,
        instanceUrl: session.instanceUrl,
        waitForRumEvent,
        waitForUniqueViews,
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

async function waitFor(condition: () => boolean, timeout: number, message: string) {
  const deadline = Date.now() + timeout
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(message)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
