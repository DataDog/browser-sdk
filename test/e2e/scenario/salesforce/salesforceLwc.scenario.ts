import { expect, test } from '@playwright/test'
import { createTest } from '../../lib/framework'

// Bypass CSP and CORS restrictions in the Salesforce app
test.use({
  bypassCSP: true,
  launchOptions: {
    // This flag is chromium-only
    args: ['--disable-web-security'],
  },
})

createTest('salesforce')
  .withSalesforceApp()
  .run(async ({ page, intakeRegistry, flushEvents }) => {
    await expect(page.getByTestId('home-custom-actions')).toBeVisible({ timeout: 30000 })

    await page.getByTestId('custom-action-1').click()
    await page.locator('a[href*="/lightning/n/Product_Explorer"]').click()
    await expect(page.getByTestId('product-explorer')).toBeVisible()

    await flushEvents()

    // Verify that the initial view event is present.
    expect(intakeRegistry.rumViewEvents.length).toBeGreaterThanOrEqual(1)
    const homeView = intakeRegistry.rumViewEvents.find((e) => e.view.name?.includes('/page/home') === true)
    expect(homeView).toBeDefined()
    expect(homeView?.view.loading_type).toBe('initial_load')

    // Click on the custom action 1 and verify that the action event is present.
    expect(intakeRegistry.rumActionEvents.length).toBeGreaterThanOrEqual(1)
    const customAction = intakeRegistry.rumActionEvents.find(
      (e) => e.action.type === 'custom' && e.action.target?.name?.includes('custom action 1') === true
    )
    expect(customAction).toBeDefined()

    // Verify that the product explorer view event is present.
    const productExplorerView = intakeRegistry.rumViewEvents.find(
      (e) => e.view.name?.includes('/lightning/n/Product_Explorer') === true
    )
    expect(productExplorerView).toBeDefined()
    expect(productExplorerView?.view.loading_type).toBe('route_change')
  })
