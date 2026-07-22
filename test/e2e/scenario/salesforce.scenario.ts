import { expect, test } from '@playwright/test'
import { createTest } from '../lib/framework'
import type { SalesforceApp } from '../lib/framework'

// Skip non chromium browsers because --disable-web-security is chromium-only.
test.skip(() => test.info().project.name !== 'chromium', 'Salesforce app is tested on chromium only')

// Bypass CSP and CORS restrictions in the Salesforce app.
test.use({
  bypassCSP: true,
  launchOptions: { args: ['--disable-web-security'] },
})

const baseSalesforceRumConfiguration = {
  trackLongTasks: true,
  trackResources: true,
  trackUserInteractions: true,
}

const salesforceApps: SalesforceApp[] = ['lwc', 'experience-cloud', 'experience-cloud-head-markup']

for (const app of salesforceApps) {
  createTest(`salesforce ${app} views`)
    .withRum(baseSalesforceRumConfiguration)
    .withSalesforceApp(app)
    .run(async ({ page, intakeRegistry, flushEvents }) => {
      await expect(page.getByTestId('home-custom-actions')).toBeVisible({ timeout: 30000 })

      await page.getByRole('link', { name: 'Product Explorer' }).click()
      await expect(page.getByTestId('product-explorer')).toBeVisible()

      await flushEvents()

      const homeView = intakeRegistry.rumViewEvents.find((e) => e.view.loading_type === 'initial_load')
      expect(homeView).toBeDefined()

      const productExplorerView = intakeRegistry.rumViewEvents.find((e) => e.view.loading_type === 'route_change')
      expect(productExplorerView).toBeDefined()
    })

  createTest(`salesforce ${app} resources`)
    .withRum(baseSalesforceRumConfiguration)
    .withSalesforceApp(app)
    .run(async ({ page, intakeRegistry, flushEvents }) => {
      await expect(page.getByTestId('home-custom-actions')).toBeVisible({ timeout: 30000 })

      await page.getByTestId('fetch-resource').click()
      await page.getByTestId('xhr-resource').click()
      await page.getByTestId('image-resource').click()

      await flushEvents()

      const resourceTypes = new Set(intakeRegistry.rumResourceEvents.map((e) => e.resource.type))
      for (const resourceType of ['document', 'other', 'xhr', 'fetch', 'image'] as const) {
        expect(
          resourceTypes.has(resourceType),
          `missing resource type "${resourceType}", got: [${[...resourceTypes].join(', ')}]`
        ).toBe(true)
      }
    })

  createTest(`salesforce ${app} long tasks and vitals`)
    .withRum(baseSalesforceRumConfiguration)
    .withSalesforceApp(app)
    .run(async ({ page, intakeRegistry, flushEvents }) => {
      await expect(page.getByTestId('home-custom-actions')).toBeVisible({ timeout: 30000 })

      await page.getByTestId('long-task').click()
      await page.getByRole('button', { name: 'Add Duration Vital' }).click()

      await flushEvents()

      expect(intakeRegistry.rumLongTaskEvents.length).toBeGreaterThanOrEqual(1)
      if (app !== 'experience-cloud-head-markup') {
        expect(intakeRegistry.rumVitalEvents.length).toBeGreaterThanOrEqual(1)
      }
    })

  createTest(`salesforce ${app} actions`)
    .withRum(baseSalesforceRumConfiguration)
    .withSalesforceApp(app)
    .run(async ({ page, intakeRegistry, flushEvents }) => {
      await expect(page.getByTestId('home-custom-actions')).toBeVisible({ timeout: 30000 })

      await page.getByTestId('custom-action-1').click()

      await flushEvents()

      const actionTypes = new Set(intakeRegistry.rumActionEvents.map((e) => e.action.type))
      expect(actionTypes.has('click')).toBe(true)

      if (app !== 'experience-cloud-head-markup') {
        const customAction = intakeRegistry.rumActionEvents.find(
          (e) => e.action.type === 'custom' && e.action.target?.name?.includes('custom action 1') === true
        )
        expect(customAction).toBeDefined()
      }
    })

  createTest(`salesforce ${app} errors`)
    .withRum(baseSalesforceRumConfiguration)
    .withSalesforceApp(app)
    .run(async ({ page, intakeRegistry, flushEvents, withBrowserLogs }) => {
      await expect(page.getByTestId('home-custom-actions')).toBeVisible({ timeout: 30000 })

      await page.getByTestId('custom-error-1').click()
      await page.getByTestId('runtime-error').click()
      await page.evaluate(() => window.console.error('salesforce console error test'))

      await flushEvents()

      const consoleError = intakeRegistry.rumErrorEvents.find(
        (e) => e.error.source === 'console' && e.error.message?.includes('salesforce console error test') === true
      )
      expect(consoleError).toBeDefined()

      withBrowserLogs((logs) => {
        expect(logs.filter((log) => log.level === 'error').length).toBeGreaterThanOrEqual(1)
      })

      const errorEvent = intakeRegistry.rumErrorEvents.find(
        (e) => e.error.message?.includes('salesforce direct runtime error test') === true
      )
      expect(errorEvent).toBeDefined()

      if (app !== 'experience-cloud-head-markup') {
        const customError = intakeRegistry.rumErrorEvents.find(
          (e) => e.error.source === 'custom' && e.error.message?.includes('custom error 1') === true
        )
        expect(customError).toBeDefined()
      }
    })
}
