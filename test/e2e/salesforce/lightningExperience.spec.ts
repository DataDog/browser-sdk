import { expect, test } from '@playwright/test'
import { createSalesforceRumRegistry } from './support/salesforceRumRegistry'
import { getSalesforceTargets } from './support/salesforceTargets'

test('lightning experience emits a RUM view to real intake on home page load', async ({ page }) => {
  const targets = getSalesforceTargets()
  const rumRegistry = createSalesforceRumRegistry(page)

  try {
    await page.goto(targets.lightningHomeUrl, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(targets.lightningHomeUrl)
    await expect.poll(() => rumRegistry.hasViewPath('/lightning/page/home'), { timeout: 40_000 }).toBe(true)
  } finally {
    rumRegistry.stop()
  }
})
