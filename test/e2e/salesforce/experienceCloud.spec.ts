import { expect, test } from '@playwright/test'
import {
  flushSalesforceRumEvents,
  installSalesforceRumProxy,
  startSalesforceIntakeProxy,
  waitForRumProxyInitialization,
} from './support/salesforceIntakeProxy'
import { getSalesforceTargets } from './support/salesforceTargets'

test('experience cloud emits an initial home view and a route-change Product Explorer view', async ({ page }) => {
  const targets = getSalesforceTargets()
  const intakeProxy = await startSalesforceIntakeProxy()
  const productExplorerContent = page.getByText('DYNAMO X1')

  try {
    await installSalesforceRumProxy(page.context(), intakeProxy.origin)
    await page.goto(targets.experienceUrl, { waitUntil: 'domcontentloaded' })
    await waitForRumProxyInitialization(page, intakeProxy.origin)
    const productExplorerLink = page.getByRole('link', { name: 'Product Explorer' })

    await expect(productExplorerLink).toBeVisible()
    await expect(page).toHaveURL(/\/ebikes\/s\/?$/)

    await productExplorerLink.click()
    await expect(page).toHaveURL(targets.experienceProductExplorerUrl)
    await expect(productExplorerContent).toBeVisible()

    await flushSalesforceRumEvents(page)

    await intakeProxy.waitForViews([
      { path: '/ebikes/s', loadingType: 'initial_load' },
      { path: '/ebikes/s/product-explorer', loadingType: 'route_change' },
    ])
  } finally {
    await intakeProxy.stop()
  }
})
