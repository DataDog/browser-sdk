import { test, expect } from '@playwright/test'
import { createBenchmarkTest } from '../helpers'

test.describe('benchmark', () => {
  createBenchmarkTest('heavy').run(async (page, takeMeasurements) => {
    await page.goto('http://localhost:5173/');
    await takeMeasurements()

   await page.getByRole('textbox', { name: 'Search...' }).click();
    await page.getByRole('textbox', { name: 'Search...' }).fill('test super');
    await page.getByText('APM Requests↑1.23M').click();
    await page.getByRole('button', { name: '🔔' }).click();
    await page.getByText('New dashboard available2').click();
    await page.getByRole('button', { name: '🔔' }).click();
    await page.getByRole('link', { name: '📝 Logs' }).click();
    await page.getByRole('textbox', { name: 'Search log messages...' }).click();
    await page.getByRole('textbox', { name: 'Search log messages...' }).fill('war');
    await page.getByRole('button', { name: 'Clear search' }).click();
    await page.locator('label').filter({ hasText: 'ERROR' }).click();
    await page.locator('[data-test-id="log-row-log-1940"]').getByText('logging-service').click();
    await page.getByRole('button', { name: 'Copy' }).click();
    await page.getByRole('link', { name: '🖥️ Infrastructure' }).click();
    await page.getByTitle('prod-analytics-01\nCPU: 52%\nMemory: 66%\nDisk: 59%').click();
    await page.getByTitle('prod-analytics-02\nCPU: 49%\nMemory: 61%\nDisk: 65%').click();
    await page.getByText('CPU49%Memory61%Disk65%').click();
    await page.getByRole('button', { name: 'List' }).click();
    await page.getByRole('cell', { name: '61%' }).first().click();
    await page.locator('div').filter({ hasText: /^49%$/ }).first().click();
    await page.getByRole('link', { name: '⚙️ Settings' }).click();
    await page.getByRole('textbox', { name: 'Full Name *' }).click();
    await page.getByRole('textbox', { name: 'Full Name *' }).fill('John Do');
    await page.getByRole('textbox', { name: 'Full Name *' }).press('ControlOrMeta+m');
    await page.getByRole('textbox', { name: 'Full Name *' }).fill('Merci jhon');
    await page.getByRole('button', { name: 'Team' }).click();
    await page.getByRole('button', { name: 'Integrations' }).click();
    expect(true).toBe(true)
  })
})
