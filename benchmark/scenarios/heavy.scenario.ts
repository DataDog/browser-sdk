import { test, expect } from '@playwright/test'
import { createBenchmarkTest } from '../helpers'

test.describe('benchmark', () => {
  createBenchmarkTest('heavy').run(async (page, takeMeasurements) => {
    await page.goto('http://localhost:5173/', {
      waitUntil: 'networkidle',
    })

    await takeMeasurements()

    await page.getByRole('textbox', { name: 'Search...' }).fill('test search')
    await page.getByRole('textbox', { name: 'Search...' }).press('Enter')
    await page.getByText('Requests:8.0KErrors:3Latency:').click()
    await page.getByRole('button', { name: '🔔' }).click()
    await page.getByRole('link', { name: '📝 Logs' }).click()
    await page.getByRole('textbox', { name: 'Search logs...' }).click()
    await page.getByRole('textbox', { name: 'Search logs...' }).fill('')
    await page.locator('label').filter({ hasText: 'ERROR' }).locator('span').click()
    await page.getByRole('combobox').first().selectOption('api-gateway')
    await page.getByRole('combobox').nth(1).selectOption('prod-api-02')
    await page.getByRole('combobox').nth(1).selectOption('')
    await page.getByRole('combobox').first().selectOption('')
    await page.locator('.log-cell.log-cell-level').first().click()
    await page.getByText('version:').click()
    await page.getByRole('button', { name: '✕' }).click()
    await page.getByRole('link', { name: '🔍 APM Traces' }).click()
    await page.getByText('Status:AllOKWarningErrorService:All Servicesanalytics-serviceapi-gatewayauth-').click()
    await page.getByLabel('Service:').selectOption('api-gateway')
    await page.getByText('POST /api/checkout').click()
    await page.getByRole('link', { name: '🖥️ Infrastructure' }).click()
    await page.getByRole('link', { name: '⚙️ Settings' }).click()

    expect(true).toBe(true)
  })
})
