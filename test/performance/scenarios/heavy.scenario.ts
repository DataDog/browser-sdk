import { test } from '@playwright/test'
import { createBenchmarkTest } from '../createBenchmarkTest'

test.describe('benchmark', () => {
  void createBenchmarkTest('heavy').run(async (page, takeMeasurements, appUrl) => {
    // Navigate to app and wait for initial load with performance throttling
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' })
    await takeMeasurements()

    // Interact with metric cards (trigger CLS)
    await page.locator('.metric-card').first().click()
    await page.waitForTimeout(200)

    // Heavy dashboard interaction - multiple searches
    const topbarSearchInput = page.locator('.topbar .search-input')
    await topbarSearchInput.click()
    await topbarSearchInput.fill('test')
    await page.waitForTimeout(300)
    await topbarSearchInput.clear()
    await page.waitForTimeout(200)
    await topbarSearchInput.fill('test super')
    await page.waitForTimeout(300)

    // Scroll to trigger events and view charts
    await page.evaluate(() => window.scrollBy(0, 300))
    await page.waitForTimeout(200)
    await page.evaluate(() => window.scrollBy(0, 300))
    await page.waitForTimeout(200)
    await page.evaluate(() => window.scrollBy(0, -600))

    // Multiple notification interactions
    await page.locator('.notification-button').click()
    await page.waitForTimeout(200)
    await page.getByText('New dashboard available').click()
    await page.waitForTimeout(200)
    await page.locator('.notification-button').click()
    await page.waitForTimeout(200)
    await page.locator('.notification-button').click()
    await page.waitForTimeout(200)
    await page.locator('.notification-button').click()

    // Heavy logs interaction - multiple searches and filters
    await page.getByRole('link', { name: '📝 Logs' }).click()
    await page.waitForTimeout(300)

    const logsSearchInput = page.locator('.logs-explorer .search-input')
    await logsSearchInput.click()
    await logsSearchInput.fill('er')
    await page.waitForTimeout(400)
    await logsSearchInput.fill('error')
    await page.waitForTimeout(400)
    await page.locator('.logs-explorer .search-clear').click()

    await logsSearchInput.click()
    await logsSearchInput.fill('war')
    await page.waitForTimeout(400)
    await page.locator('.logs-explorer .search-clear').click()

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

    // Click on a log row to open details
    await page.locator('.log-row').first().click()
    await page.waitForTimeout(300)

    // Copy log details
    await page.locator('.log-details .copy-btn').click()
    await page.waitForTimeout(200)

    // Close log details
    await page.locator('.log-details .close-btn').click()
    await page.evaluate(() => window.scrollBy(0, -400))

    // Heavy infrastructure interaction
    await page.getByRole('link', { name: '🖥️ Infrastructure' }).click()
    await page.waitForTimeout(500)

    // Search hosts
    const hostSearch = page.locator('.host-search')
    await hostSearch.click()
    await hostSearch.fill('prod')
    await page.waitForTimeout(300)
    await hostSearch.clear()
    await page.waitForTimeout(400)

    // Multiple host clicks in map view - wait for host cells to be visible
    await page.waitForSelector('.host-cell', { state: 'visible' })
    await page.locator('.host-cell').nth(0).click()
    await page.waitForTimeout(300)

    // Close host details before selecting another
    await page.locator('.host-details .close-btn').click()
    await page.waitForTimeout(200)

    await page.locator('.host-cell').nth(1).click()
    await page.waitForTimeout(300)

    // Close host details before selecting another
    await page.locator('.host-details .close-btn').click()
    await page.waitForTimeout(200)

    await page.locator('.host-cell').nth(2).click()
    await page.waitForTimeout(300)

    // Close host details
    await page.locator('.host-details .close-btn').click()
    await page.waitForTimeout(200)

    // Switch to list view
    await page.locator('.toggle-btn').filter({ hasText: 'List' }).click()
    await page.waitForTimeout(400)

    // Sort by clicking column headers
    await page.locator('.host-table th').filter({ hasText: 'CPU' }).click()
    await page.waitForTimeout(300)
    await page.locator('.host-table th').filter({ hasText: 'Memory' }).click()
    await page.waitForTimeout(300)

    // Click on multiple hosts in list view
    const hostRows = page.locator('.host-row')
    await hostRows.nth(0).click()
    await page.waitForTimeout(300)
    await hostRows.nth(2).click()
    await page.waitForTimeout(300)
    await hostRows.nth(1).click()
    await page.waitForTimeout(300)

    // Switch back to map view
    await page.locator('.toggle-btn').filter({ hasText: 'Map' }).click()
    await page.waitForTimeout(400)

    // Heavy settings interaction with multiple form edits
    await page.getByRole('link', { name: '⚙️ Settings' }).click()
    await page.waitForTimeout(300)

    // Edit user settings form with multiple incremental changes
    const nameInput = page.locator('#name')
    await nameInput.click()
    await nameInput.fill('J')
    await page.waitForTimeout(100)
    await nameInput.fill('Jo')
    await page.waitForTimeout(100)
    await nameInput.fill('John Do')
    await page.waitForTimeout(200)
    await nameInput.press('ControlOrMeta+a')
    await nameInput.fill('Jane')
    await page.waitForTimeout(200)
    await nameInput.press('ControlOrMeta+a')
    await nameInput.fill('John Smith')
    await page.waitForTimeout(200)

    // Change role dropdown
    const roleSelect = page.locator('#role')
    await roleSelect.click()
    await roleSelect.selectOption('Developer')
    await page.waitForTimeout(200)

    // Multiple tab switches
    await page.locator('.tab-button').filter({ hasText: 'Team' }).click()
    await page.waitForTimeout(400)
    await page.locator('.tab-button').filter({ hasText: 'Integrations' }).click()
    await page.waitForTimeout(400)
    await page.locator('.tab-button').filter({ hasText: 'User Settings' }).click()
    await page.waitForTimeout(400)
    await page.locator('.tab-button').filter({ hasText: 'Team' }).click()
    await page.waitForTimeout(400)
    await page.locator('.tab-button').filter({ hasText: 'Integrations' }).click()
    await page.waitForTimeout(400)

    // Return to dashboard for final heavy interactions
    await page.getByRole('link', { name: '📊 Dashboard' }).click()
    await page.waitForTimeout(300)

    const topbarSearch = page.locator('.topbar .search-input')
    await topbarSearch.click()
    await topbarSearch.fill('final')
    await page.waitForTimeout(300)
    await page.evaluate(() => window.scrollBy(0, 500))
    await page.waitForTimeout(200)
    await page.evaluate(() => window.scrollBy(0, -500))
  })
})
