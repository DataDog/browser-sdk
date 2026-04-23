import { expect, test } from '@playwright/test'
import { createSalesforceRumRegistry } from './support/salesforceRumRegistry'
import { getSalesforceTargets } from './support/salesforceTargets'

test('experience cloud emits a home RUM view before navigating to Product Explorer', async ({ page }) => {
  const targets = getSalesforceTargets()
  const rumRegistry = createSalesforceRumRegistry(page)

  try {
    await page.goto(targets.experienceUrl, { waitUntil: 'domcontentloaded' })
    const productExplorerLink = page.getByRole('link', { name: 'Product Explorer' })

    await expect(productExplorerLink).toBeVisible()
    await expect(page).toHaveURL(/\/ebikes\/s\/?$/)

    await productExplorerLink.click()
    await expect(page).toHaveURL(targets.experienceProductExplorerUrl)
    await expect.poll(() => rumRegistry.hasViewPath('/ebikes/s'), { timeout: 40_000 }).toBe(true)
    } finally {
    rumRegistry.stop()
  }
})
