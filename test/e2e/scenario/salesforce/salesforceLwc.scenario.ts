import { expect, test } from '@playwright/test'
import { createTest } from '../../lib/framework'

// Skip non chromium browsers because --disable-web-security is chromium-only.
test.skip(() => test.info().project.name !== 'chromium', 'Salesforce app is tested on chromium only')

// Bypass CSP and CORS restrictions in the Salesforce app.
test.use({
  bypassCSP: true,
  launchOptions: { args: ['--disable-web-security'] },
})

// All tests authenticate as the same Salesforce user via the JWT bearer + UI Bridge
// (frontdoor/singleaccess) flow. Running them concurrently across workers races
// that single user's session and can invalidate each other's frontdoor URLs, so
// force this file to run serially in one worker.
test.describe.configure({ mode: 'serial' })

const salesforceRumConfiguration = {
  trackLongTasks: true,
  trackResources: true,
  trackUserInteractions: true,
}

createTest('salesforce views')
  .withRum(salesforceRumConfiguration)
  .withSalesforceApp()
  .run(async ({ page, intakeRegistry, flushEvents }) => {
    await expect(page.getByTestId('salesforce-home-actions')).toBeVisible({ timeout: 30000 })

    await page.getByRole('link', { name: 'Product Explorer' }).click()
    await expect(page.getByTestId('salesforce-product-explorer')).toBeVisible()

    await flushEvents()

    const homeView = intakeRegistry.rumViewEvents.find((e) => e.view.name?.includes('/page/home') === true)
    expect(homeView).toBeDefined()
    expect(homeView?.view.loading_type).toBe('initial_load')

    const productExplorerView = intakeRegistry.rumViewEvents.find(
      (e) => e.view.name?.includes('/lightning/n/Product_Explorer') === true
    )
    expect(productExplorerView).toBeDefined()
    expect(productExplorerView?.view.loading_type).toBe('route_change')
  })

createTest('salesforce resources')
  .withRum(salesforceRumConfiguration)
  .withSalesforceApp()
  .run(async ({ page, intakeRegistry, flushEvents }) => {
    await expect(page.getByTestId('salesforce-home-actions')).toBeVisible({ timeout: 30000 })

    await page.getByRole('button', { name: 'Fetch Resource' }).click()
    await page.getByRole('button', { name: 'XHR Resource' }).click()

    await flushEvents()

    const resourceTypes = new Set(intakeRegistry.rumResourceEvents.map((e) => e.resource.type))
    for (const resourceType of ['document', 'js', 'image', 'other', 'xhr', 'fetch'] as const) {
      expect(resourceTypes.has(resourceType)).toBe(true)
    }
  })

createTest('salesforce long tasks and vitals')
  .withRum(salesforceRumConfiguration)
  .withSalesforceApp()
  .run(async ({ page, intakeRegistry, flushEvents }) => {
    await expect(page.getByTestId('salesforce-home-actions')).toBeVisible({ timeout: 30000 })

    await page.getByTestId('long-task').click()
    await page.getByRole('button', { name: 'Add Duration Vital' }).click()

    await flushEvents()

    expect(intakeRegistry.rumLongTaskEvents.length).toBeGreaterThanOrEqual(1)
    expect(intakeRegistry.rumVitalEvents.length).toBeGreaterThanOrEqual(1)
  })

createTest('salesforce actions')
  .withRum(salesforceRumConfiguration)
  .withSalesforceApp()
  .run(async ({ page, intakeRegistry, flushEvents }) => {
    await expect(page.getByTestId('salesforce-home-actions')).toBeVisible({ timeout: 30000 })

    await page.getByTestId('custom-action-1').click()

    await flushEvents()

    const actionTypes = new Set(intakeRegistry.rumActionEvents.map((e) => e.action.type))
    expect(actionTypes.has('custom')).toBe(true)
    expect(actionTypes.has('click')).toBe(true)

    const customAction = intakeRegistry.rumActionEvents.find(
      (e) => e.action.type === 'custom' && e.action.target?.name?.includes('custom action 1') === true
    )
    expect(customAction).toBeDefined()
  })

createTest('salesforce errors')
  .withRum(salesforceRumConfiguration)
  .withSalesforceApp()
  .run(async ({ page, intakeRegistry, flushEvents, withBrowserLogs }) => {
    await expect(page.getByTestId('salesforce-home-actions')).toBeVisible({ timeout: 30000 })

    await page.getByTestId('custom-error-1').click()
    await page.getByRole('button', { name: 'Runtime Error' }).click()
    await page.evaluate(() => window.console.error('salesforce console error test'))

    await flushEvents()

    withBrowserLogs((logs) => {
      expect(logs.filter((log) => log.level === 'error').length).toBeGreaterThanOrEqual(1)
    })

    const errorSources = new Set(intakeRegistry.rumErrorEvents.map((e) => e.error.source))
    expect(errorSources.has('custom')).toBe(true)
    expect(errorSources.has('source')).toBe(true)
    expect(errorSources.has('console')).toBe(true)
  })
