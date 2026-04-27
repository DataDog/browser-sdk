import { test } from '@playwright/test'
import { createBenchmarkTest } from '../createBenchmarkTest'

test.describe('benchmark', () => {
  void createBenchmarkTest('shopistLike').run(async (page, takeMeasurements, appUrl) => {
    // Navigate to app and wait for initial load
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.promo-banner', { state: 'visible' })
    await takeMeasurements()

    // Browse categories
    await page.getByRole('link', { name: 'CHAIRS' }).click()
    await page.waitForTimeout(300)

    await page.getByRole('link', { name: 'SOFAS' }).click()
    await page.waitForTimeout(300)

    // Scroll through products
    await page.evaluate(() => window.scrollBy(0, 400))
    await page.waitForTimeout(200)
    await page.evaluate(() => window.scrollBy(0, -400))
    await page.waitForTimeout(200)

    // View product details
    await page.locator('.product-card').first().click()
    await page.waitForTimeout(400)

    // Add to cart
    await page.locator('.add-to-cart-button').click()
    await page.waitForTimeout(200)

    // Back to products
    await page.locator('.back-button').click()
    await page.waitForTimeout(300)

    // Add more items to cart - need to go to detail page for each
    await page.locator('.product-card').nth(1).click()
    await page.waitForTimeout(400)
    await page.locator('.add-to-cart-button').click()
    await page.waitForTimeout(200)
    await page.locator('.back-button').click()
    await page.waitForTimeout(300)

    // Go to cart
    await page.getByRole('link', { name: /CART/ }).click()
    await page.waitForTimeout(400)

    // Update quantities
    const increaseButtons = page.locator('.quantity-button').filter({ hasText: '+' })
    await increaseButtons.first().click()
    await page.waitForTimeout(200)
    await increaseButtons.nth(1).click()
    await page.waitForTimeout(200)

    // Try discount code
    const discountInput = page.locator('.discount-input')
    await discountInput.click()
    await discountInput.pressSequentially('SAVE')
    await page.waitForTimeout(200)
    await page.locator('.apply-button').click()
    await page.waitForTimeout(300)

    // Remove item
    await page.locator('.remove-button').first().click()
    await page.waitForTimeout(300)

    // Edit profile
    await page.getByRole('link', { name: 'MY PROFILE' }).click()
    await page.waitForTimeout(400)
    await page.locator('.edit-profile-button').click()
    await page.waitForTimeout(400)

    // Fill form with incremental typing
    const firstNameInput = page.locator('#firstName')
    await firstNameInput.click()
    await firstNameInput.pressSequentially('Jane')
    await page.waitForTimeout(200)

    const addressInput = page.locator('#address')
    await addressInput.click()
    await addressInput.press('ControlOrMeta+a')
    await addressInput.pressSequentially('123 Main Street')
    await page.waitForTimeout(100)

    const stateSelect = page.locator('#state')
    await stateSelect.click()
    await stateSelect.selectOption('CA')
    await page.waitForTimeout(200)

    const phoneInput = page.locator('#phone')
    await phoneInput.click()
    await phoneInput.press('ControlOrMeta+a')
    await phoneInput.pressSequentially('415-555-1234')
    await page.waitForTimeout(200)

    // Save profile
    await page.locator('.save-button').click()
    await page.waitForTimeout(400)
  })
})
