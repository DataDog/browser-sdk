import { expect, test } from '@playwright/test'
import {
  flushSalesforceRumEvents,
  installSalesforceRumProxy,
  startSalesforceIntakeProxy,
  waitForRumProxyInitialization,
} from './support/salesforceIntakeProxy'
import { getSalesforceTargets } from './support/salesforceTargets'

test('lightning experience emits an initial home view and a route-change Product Explorer view', async ({
  page,
}) => {
  const targets = getSalesforceTargets()
  const intakeProxy = await startSalesforceIntakeProxy()
  const productExplorerContent = page.getByText('DYNAMO X1')

  try {
    await installSalesforceRumProxy(page.context(), intakeProxy.origin)
    await page.goto(targets.lightningHomeUrl, { waitUntil: 'domcontentloaded' })
    await waitForRumProxyInitialization(page, intakeProxy.origin)
    const productExplorerLink = page.getByRole('link', { name: 'Product Explorer' })

    await expect(productExplorerLink).toBeVisible()
    await expect(page).toHaveURL(targets.lightningHomeUrl)

    await productExplorerLink.click()
    await expect(page).toHaveURL(targets.lightningProductExplorerUrl)
    await expect(productExplorerContent).toBeVisible()

    await flushSalesforceRumEvents(page)

    await intakeProxy.waitForViews([
      { path: '/lightning/page/home', loadingType: 'initial_load' },
      { path: '/lightning/n/Product_Explorer', loadingType: 'route_change' },
    ])
  } finally {
    await intakeProxy.stop()
  }
})
