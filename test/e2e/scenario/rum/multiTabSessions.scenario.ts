import { test, expect } from '@playwright/test'
import { expireSession } from '../../lib/helpers/session'
import { createTest } from '../../lib/framework'

test.describe('multi-tab sessions', () => {
  createTest('session expiry and renewal across tabs')
    .withRum()
    .run(async ({ page, browserContext, baseUrl }) => {
      // --- Step 1: Both tabs have an active session ---
      const tab1Session = await page.evaluate(() => window.DD_RUM!.getInternalContext()?.session_id)
      expect(tab1Session).toBeDefined()

      const page2 = await browserContext.newPage()
      await page2.goto(baseUrl)

      const tab2Session = await page2.evaluate(() => window.DD_RUM!.getInternalContext()?.session_id)
      expect(tab2Session).toBeDefined()
      expect(tab2Session).toBe(tab1Session)

      // --- Step 2: Expire the session, verify both tabs detect it ---
      await expireSession(page, browserContext)

      // Wait for Tab 2 to also detect the expiry via cookie polling (1s interval)
      await page2.waitForTimeout(1100)

      const tab1AfterExpiry = await page.evaluate(() => window.DD_RUM!.getInternalContext()?.session_id)
      const tab2AfterExpiry = await page2.evaluate(() => window.DD_RUM!.getInternalContext()?.session_id)
      expect(tab1AfterExpiry).toBeUndefined()
      expect(tab2AfterExpiry).toBeUndefined()

      // --- Step 3: Renew session in Tab 1 via user interaction ---
      await page.locator('html').click()

      // Wait for the new session to be created and the next poll cycle
      await page.waitForTimeout(1100)

      const tab1Renewed = await page.evaluate(() => window.DD_RUM!.getInternalContext()?.session_id)
      expect(tab1Renewed).toBeDefined()
      expect(tab1Renewed).not.toBe(tab1Session)

      // Wait for Tab 2's poll cycle to pick up the cookie change
      await page2.waitForTimeout(1100)

      // Tab 2 should NOT have adopted the new session (no user interaction in Tab 2)
      const tab2AfterRenewal = await page2.evaluate(() => window.DD_RUM!.getInternalContext()?.session_id)
      expect(tab2AfterRenewal).toBeUndefined()

      // --- Step 4: Tab 2 renews via its own user interaction ---
      await page2.locator('html').click()
      await page2.waitForTimeout(1100)

      const tab2Renewed = await page2.evaluate(() => window.DD_RUM!.getInternalContext()?.session_id)
      expect(tab2Renewed).toBeDefined()
      expect(tab2Renewed).toBe(tab1Renewed)

      await page2.close()
    })
})
