import { test, expect } from '@playwright/test'
import { createBenchmarkTest } from '../createBenchmarkTest'

test.describe('benchmark', () => {
  createBenchmarkTest('heavy').run(async (page, takeMeasurements, appUrl) => {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' })
    await takeMeasurements()

    // Heavy dashboard interaction - multiple searches
    await page.getByRole('textbox', { name: 'Search...' }).click()
    await page.getByRole('textbox', { name: 'Search...' }).fill('test')
    await page.waitForTimeout(300)
    await page.getByRole('textbox', { name: 'Search...' }).clear()
    await page.getByRole('textbox', { name: 'Search...' }).fill('test super')
    await page.getByText('APM Requests↑1.23M').click()

    // Scroll to trigger events
    await page.evaluate(() => window.scrollBy(0, 300))
    await page.waitForTimeout(200)
    await page.evaluate(() => window.scrollBy(0, -300))

    // Multiple notification interactions
    await page.getByRole('button', { name: '🔔' }).click()
    await page.getByText('New dashboard available2').click()
    await page.getByRole('button', { name: '🔔' }).click()
    await page.waitForTimeout(200)
    await page.getByRole('button', { name: '🔔' }).click()
    await page.getByRole('button', { name: '🔔' }).click()

    // Heavy logs interaction - multiple searches and filters
    await page.getByRole('link', { name: '📝 Logs' }).click()
    await page.getByRole('textbox', { name: 'Search log messages...' }).click()
    await page.getByRole('textbox', { name: 'Search log messages...' }).fill('er')
    await page.waitForTimeout(300)
    await page.getByRole('textbox', { name: 'Search log messages...' }).fill('error')
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Clear search' }).click()

    await page.getByRole('textbox', { name: 'Search log messages...' }).click()
    await page.getByRole('textbox', { name: 'Search log messages...' }).fill('war')
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Clear search' }).click()

    // Multiple filter toggles
    await page.locator('label').filter({ hasText: 'ERROR' }).click()
    await page.waitForTimeout(200)
    await page.locator('label').filter({ hasText: 'WARN' }).click()
    await page.waitForTimeout(200)
    await page.locator('label').filter({ hasText: 'WARN' }).click()
    await page.waitForTimeout(200)

    // Log inspection with scrolling
    await page.evaluate(() => window.scrollBy(0, 400))
    await page.waitForTimeout(200)
    await page.locator('[data-test-id="log-row-log-1940"]').getByText('logging-service').click()
    await page.getByRole('button', { name: 'Copy' }).click()
    await page.evaluate(() => window.scrollBy(0, -400))

    // Heavy infrastructure interaction
    await page.getByRole('link', { name: '🖥️ Infrastructure' }).click()

    // Multiple host clicks
    await page.getByTitle('prod-analytics-01\nCPU: 52%\nMemory: 66%\nDisk: 59%').click()
    await page.waitForTimeout(200)
    await page.getByTitle('prod-analytics-02\nCPU: 49%\nMemory: 61%\nDisk: 65%').click()
    await page.waitForTimeout(200)
    await page.getByText('CPU49%Memory61%Disk65%').click()
    await page.waitForTimeout(200)
    await page.getByTitle('prod-analytics-01\nCPU: 52%\nMemory: 66%\nDisk: 59%').click()
    await page.waitForTimeout(200)

    // View switching multiple times
    await page.getByRole('button', { name: 'List' }).click()
    await page.waitForTimeout(300)
    await page.getByRole('cell', { name: '61%' }).first().click()
    await page.waitForTimeout(200)
    await page.locator('div').filter({ hasText: /^49%$/ }).first().click()
    await page.waitForTimeout(200)
    await page.getByRole('cell', { name: '61%' }).first().click()

    // Heavy settings interaction with multiple form edits
    await page.getByRole('link', { name: '⚙️ Settings' }).click()
    await page.getByRole('textbox', { name: 'Full Name *' }).click()
    await page.getByRole('textbox', { name: 'Full Name *' }).fill('J')
    await page.waitForTimeout(100)
    await page.getByRole('textbox', { name: 'Full Name *' }).fill('Jo')
    await page.waitForTimeout(100)
    await page.getByRole('textbox', { name: 'Full Name *' }).fill('John Do')
    await page.waitForTimeout(200)
    await page.getByRole('textbox', { name: 'Full Name *' }).press('ControlOrMeta+a')
    await page.getByRole('textbox', { name: 'Full Name *' }).fill('Jane')
    await page.waitForTimeout(200)
    await page.getByRole('textbox', { name: 'Full Name *' }).press('ControlOrMeta+a')
    await page.getByRole('textbox', { name: 'Full Name *' }).fill('Merci jhon')

    // Multiple tab switches
    await page.getByRole('button', { name: 'Team' }).click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Integrations' }).click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Team' }).click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Integrations' }).click()

    // Return to dashboard for final heavy interactions
    await page.getByRole('link', { name: '📊 Dashboard' }).click()
    await page.getByRole('textbox', { name: 'Search...' }).click()
    await page.getByRole('textbox', { name: 'Search...' }).fill('final')
    await page.waitForTimeout(200)
    await page.evaluate(() => window.scrollBy(0, 500))
    await page.waitForTimeout(200)
    await page.evaluate(() => window.scrollBy(0, -500))

    // Final logs check
    await page.getByRole('link', { name: '📝 Logs' }).click()
    await page.locator('label').filter({ hasText: 'INFO' }).click()
    await page.waitForTimeout(200)
    await page.locator('label').filter({ hasText: 'INFO' }).click()

    expect(true).toBe(true)
  })
})
