import { test, expect } from '@playwright/test'
import {
  cleanupSalesforceTrustedUrls,
  createTest,
  getSalesforceE2eConfig,
  getSfSession,
  goToSalesforcePage,
  type IntakeRegistry,
  type SalesforceE2eConfig,
  type Servers,
  type SfSession,
} from '../../lib/framework'

let sfSession: SfSession | undefined
let sfConfig: SalesforceE2eConfig

function uniqueViews(intakeRegistry: IntakeRegistry) {
  return [...new Map(intakeRegistry.rumViewEvents.map((event) => [event.view.id, event])).values()]
}

function expectFreshSalesforceBundle(intakeRegistry: IntakeRegistry) {
  expect(intakeRegistry.rumEvents.some((event) => event.version === sfConfig.sha)).toBe(true)
}

function expectRequiredViews(intakeRegistry: IntakeRegistry) {
  const views = uniqueViews(intakeRegistry)
  expect(views.length).toBeGreaterThanOrEqual(2)
  expect(views.find((event) => event.view.url.includes('lightning/page/home'))).toBeDefined()
  expect(views.find((event) => event.view.name?.includes('Account'))).toBeDefined()
}

async function openSalesforceHome(
  page: Parameters<typeof goToSalesforcePage>[0]['page'],
  servers: Servers,
  intakeRegistry: IntakeRegistry
) {
  await goToSalesforcePage({
    page,
    servers,
    intakeRegistry,
    session: sfSession!,
    config: sfConfig,
    path: '/lightning/page/home',
  })
  await expect
    .poll(() => intakeRegistry.rumEvents.some((event) => event.version === sfConfig.sha), {
      message: `Timed out waiting for Salesforce RUM version ${sfConfig.sha}`,
      timeout: 30_000,
    })
    .toBe(true)
}

test.describe('Salesforce Lightning — Datadog RUM SDK', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  test.beforeAll(() => {
    sfSession = getSfSession()
    sfConfig = getSalesforceE2eConfig()
  })

  test.afterAll(async () => {
    await cleanupSalesforceTrustedUrls(sfSession)
  })

  createTest('captures views, custom action, and auto-click actions')
    .withSetup(() => '')
    .run(async ({ page, servers, intakeRegistry, flushEvents }) => {
      await openSalesforceHome(page, servers, intakeRegistry)

      await page.locator('[data-testid="custom-action-1"]').click()
      await page.getByRole('link', { name: 'Accounts' }).click()
      await page.waitForURL(/Account\/home/i)

      await flushEvents()

      expectFreshSalesforceBundle(intakeRegistry)
      expectRequiredViews(intakeRegistry)

      const customAction = intakeRegistry.rumActionEvents.find((event) => event.action.type === 'custom')
      expect(customAction).toBeDefined()
      expect(customAction!.view).toMatchObject({ url: expect.stringContaining('lightning/page/home') })

      const navClickAction = intakeRegistry.rumActionEvents.find((event) => event.action.type === 'click')
      expect(navClickAction).toBeDefined()
      expect(navClickAction!.view).toMatchObject({ name: expect.stringContaining('/lightning/page/home') })
    })

  createTest('captures resources of every type')
    .withSetup(() => '')
    .run(async ({ page, servers, intakeRegistry, flushEvents }) => {
      await openSalesforceHome(page, servers, intakeRegistry)

      await page.getByRole('link', { name: 'Accounts' }).click()
      await page.waitForURL(/Account\/home/i)

      await flushEvents()

      expectFreshSalesforceBundle(intakeRegistry)
      expectRequiredViews(intakeRegistry)

      for (const type of ['document', 'other', 'js', 'xhr', 'fetch']) {
        const resources = intakeRegistry.rumResourceEvents.filter((event) => event.resource.type === type)
        expect(resources.length, `expected at least one ${type} resource`).toBeGreaterThanOrEqual(1)
        expect(resources[0].resource.url).toBeTruthy()
        expect(resources[0].resource.duration).toBeGreaterThan(0)
      }
    })

  createTest('captures custom errors and long tasks')
    .withSetup(() => '')
    .run(async ({ page, servers, browserName, intakeRegistry, flushEvents }) => {
      test.skip(browserName !== 'chromium', 'Long Tasks API is Chromium-only')

      await openSalesforceHome(page, servers, intakeRegistry)

      await page.locator('[data-testid="custom-error-1"]').click()
      await page.locator('[data-testid="long-task"]').click()

      await flushEvents()

      expectFreshSalesforceBundle(intakeRegistry)
      expect(intakeRegistry.rumErrorEvents[0].error).toMatchObject({ message: 'custom error 1' })
      expect(intakeRegistry.rumLongTaskEvents[0].long_task).toMatchObject({ duration: expect.any(Number) })
      expect(intakeRegistry.rumLongTaskEvents[0].long_task.duration).toBeGreaterThan(50)
    })
})
