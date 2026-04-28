import { expect, test } from '@playwright/test'
import {
  flushSalesforceRumEvents,
  installSalesforceRumProxy,
  startSalesforceIntakeProxy,
  waitForRumProxyInitialization,
} from './support/salesforceIntakeProxy'
import { getDreamhouseAuraSalesforceTargets } from './support/salesforceTargets'

test('dreamhouse aura lightning experience emits an initial Property Finder view and a route-change Property Explorer view', async ({
  page,
}) => {
  const targets = getDreamhouseAuraSalesforceTargets()
  const intakeProxy = await startSalesforceIntakeProxy()
  const propertyExplorerContent = page.getByPlaceholder('How can I assist you?')

  try {
    await installSalesforceRumProxy(page.context(), intakeProxy.origin)
    await page.goto(targets.lightningPropertyFinderUrl, { waitUntil: 'domcontentloaded' })
    await waitForRumProxyInitialization(page, intakeProxy.origin)
    const propertyExplorerLink = page.getByRole('link', { name: 'Property Explorer' })

    await expect(propertyExplorerLink).toBeVisible()
    await expect(page).toHaveURL(targets.lightningPropertyFinderUrl)

    await propertyExplorerLink.click()
    await expect(page).toHaveURL(targets.lightningPropertyExplorerUrl)
    await expect(propertyExplorerContent).toBeVisible()

    await flushSalesforceRumEvents(page)

    await intakeProxy.waitForViews([
      { path: '/lightning/n/Property_Finder', loadingType: 'initial_load' },
      { path: '/lightning/n/Property_Explorer', loadingType: 'route_change' },
    ])
  } finally {
    await intakeProxy.stop()
  }
})
