import { expect, test } from '@playwright/test'
import { createTest } from '../../lib/framework'
import type { SalesforceApp } from '../../lib/framework'

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

for (const app of ['experience-cloud', 'experience-head-markup']) {
  createTest(`salesforce experience ${app} views`)
    .withRum(salesforceRumConfiguration)
    .withSalesforceApp(app as SalesforceApp)
    .run(async ({ page, intakeRegistry, flushEvents }) => {
      await expect(page.getByTestId('experience-home-actions')).toBeVisible({ timeout: 30000 })

      await page.getByTestId('product-explorer-link').click()
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

  createTest(`salesforce experience resources and long tasks ${app}`)
    .withRum(salesforceRumConfiguration)
    .withSalesforceApp(app as SalesforceApp)
    .run(async ({ page, intakeRegistry, flushEvents }) => {
      await expect(page.getByTestId('experience-home-actions')).toBeVisible({ timeout: 30000 })

      await page.getByTestId('fetch-resource').click()
      await page.getByTestId('xhr-resource').click()
      await page.getByTestId('long-task').click()

      await flushEvents()

      const resourceTypes = new Set(intakeRegistry.rumResourceEvents.map((e) => e.resource.type))
      for (const resourceType of ['document', 'xhr', 'fetch'] as const) {
        expect(resourceTypes.has(resourceType)).toBe(true)
      }
      expect(intakeRegistry.rumLongTaskEvents.length).toBeGreaterThanOrEqual(1)
    })

  createTest(`salesforce experience actions ${app}`)
    .withRum(salesforceRumConfiguration)
    .withSalesforceApp(app as SalesforceApp)
    .run(async ({ page, intakeRegistry, flushEvents }) => {
      await expect(page.getByTestId('experience-home-actions')).toBeVisible({ timeout: 30000 })

      await page.getByTestId('custom-action-1').click()

      await flushEvents()

      const actionTypes = new Set(intakeRegistry.rumActionEvents.map((e) => e.action.type))
      expect(actionTypes.has('click')).toBe(true)

      if (app === 'experience-cloud') {
        const customAction = intakeRegistry.rumActionEvents.find(
          (e) => e.action.type === 'custom' && e.action.target?.name?.includes('custom action 1') === true
        )
        expect(customAction).toBeDefined()
      } else {
        const clickAction = intakeRegistry.rumActionEvents.find(
          (e) => e.action.type === 'click' && e.action.target?.name?.includes('Custom Action 1') === true
        )
        expect(clickAction).toBeDefined()
      }
    })

  createTest(`salesforce experience errors ${app}`)
    .withRum(salesforceRumConfiguration)
    .withSalesforceApp(app as SalesforceApp)
    .run(async ({ page, intakeRegistry, flushEvents, withBrowserLogs }) => {
      await expect(page.getByTestId('experience-home-actions')).toBeVisible({ timeout: 30000 })

      await page.getByTestId('custom-error-1').click()
      await page.getByTestId('runtime-error').click()

      await flushEvents()

      withBrowserLogs((logs) => {
        expect(logs.filter((log) => log.level === 'error').length).toBeGreaterThanOrEqual(1)
      })

      const errorEvent = intakeRegistry.rumErrorEvents.find((e) => e.error.source === 'console')
      expect(errorEvent).toBeDefined()
      expect(errorEvent?.error.source).toBe('console')
      expect(errorEvent?.error.message).toContain('salesforce experience direct runtime error test')

      if (app === 'experience-cloud') {
        const customError = intakeRegistry.rumErrorEvents.find(
          (e) => e.error.source === 'custom' && e.error.message?.includes('custom error 1') === true
        )
        expect(customError).toBeDefined()
      }
    })
}
