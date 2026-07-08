import { expect, test } from '@playwright/test'
import { createTest } from '../../lib/framework'

// Skip non chromium browsers because --disable-web-security is chromium-only.
test.skip(() => test.info().project.name !== 'chromium', 'Salesforce app is tested on chromium only')

// Bypass CSP and CORS restrictions in the Salesforce app.
test.use({
  bypassCSP: true,
  launchOptions: { args: ['--disable-web-security'] },
})

const salesforceRumConfiguration = {
  trackLongTasks: true,
  trackResources: true,
  trackUserInteractions: true,
}

createTest('salesforce experience views')
  .withRum(salesforceRumConfiguration)
  .withSalesforceApp('experience-cloud')
  .run(async ({ page, intakeRegistry, flushEvents }) => {
    await expect(page.getByTestId('experience-home-actions')).toBeVisible({ timeout: 30000 })

    await page.locator('a[href="product-explorer"]').click()
    await expect(page.getByTestId('experience-product-explorer')).toBeVisible()

    await flushEvents()

    const homeView = intakeRegistry.rumViewEvents.find((e) => e.view.url?.includes('sfexperiencecloud') === true)
    expect(homeView).toBeDefined()
    expect(homeView?.view.loading_type).toBe('initial_load')

    const productExplorerView = intakeRegistry.rumViewEvents.find(
      (e) => e.view.url?.includes('product-explorer') === true
    )
    expect(productExplorerView).toBeDefined()
    expect(productExplorerView?.view.loading_type).toBe('route_change')
  })

createTest('salesforce experience resources')
  .withRum(salesforceRumConfiguration)
  .withSalesforceApp('experience-cloud')
  .run(async ({ page, intakeRegistry, flushEvents }) => {
    await expect(page.getByTestId('experience-home-actions')).toBeVisible({ timeout: 30000 })

    await page.getByRole('button', { name: 'Fetch Resource' }).click()
    await page.getByRole('button', { name: 'XHR Resource' }).click()

    await flushEvents()

    const resourceTypes = new Set(intakeRegistry.rumResourceEvents.map((e) => e.resource.type))
    for (const resourceType of ['document', 'xhr', 'fetch'] as const) {
      expect(resourceTypes.has(resourceType)).toBe(true)
    }
  })

createTest('salesforce experience long tasks')
  .withRum(salesforceRumConfiguration)
  .withSalesforceApp('experience-cloud')
  .run(async ({ page, intakeRegistry, flushEvents }) => {
    await expect(page.getByTestId('experience-home-actions')).toBeVisible({ timeout: 30000 })

    await page.getByTestId('long-task').click()

    await flushEvents()

    expect(intakeRegistry.rumLongTaskEvents.length).toBeGreaterThanOrEqual(1)
  })

createTest('salesforce experience actions')
  .withRum(salesforceRumConfiguration)
  .withSalesforceApp('experience-cloud')
  .run(async ({ page, intakeRegistry, flushEvents }) => {
    await expect(page.getByTestId('experience-home-actions')).toBeVisible({ timeout: 30000 })

    await page.getByTestId('custom-action-1').click()

    await flushEvents()

    const actionTypes = new Set(intakeRegistry.rumActionEvents.map((e) => e.action.type))
    expect(actionTypes.has('click')).toBe(true)

    const autoAction = intakeRegistry.rumActionEvents.find(
      (e) => e.action.type === 'click' && e.action.target?.name?.includes('Custom Action 1') === true
    )
    expect(autoAction).toBeDefined()
  })

createTest('salesforce experience errors')
  .withRum(salesforceRumConfiguration)
  .withSalesforceApp('experience-cloud')
  .run(async ({ page, intakeRegistry, flushEvents, withBrowserLogs }) => {
    await expect(page.getByTestId('experience-home-actions')).toBeVisible({ timeout: 30000 })

    await page.getByRole('button', { name: 'Runtime Error' }).click()

    await flushEvents()

    withBrowserLogs((logs) => {
      expect(logs.filter((log) => log.level === 'error').length).toBeGreaterThanOrEqual(1)
    })

    const errorEvent = intakeRegistry.rumErrorEvents.find((e) => e.error.source === 'console')
    expect(errorEvent).toBeDefined()
    expect(errorEvent?.error.source).toBe('console')
    expect(errorEvent?.error.message).toContain('salesforce experience direct runtime error test')
  })
