import { test, expect } from '@playwright/test'
import { createSalesforceTest } from '../../lib/framework'

function uniqueViews(sfRegistry: { rumViewEvents: Array<Record<string, any>> }) {
  return [...new Map(sfRegistry.rumViewEvents.map((e) => [e['view']?.['id'], e])).values()]
}

test.describe('Salesforce Lightning — Datadog RUM SDK', () => {
  createSalesforceTest('captures views, custom action, and auto-click actions')
    .withPath('/lightning/page/home')
    .run(async ({ page, sfRegistry, waitFor }) => {
      await waitFor(() => uniqueViews(sfRegistry).length >= 1, 20000, 'Timed out waiting for initial view')
      expect(uniqueViews(sfRegistry)).toHaveLength(1)
      expect(uniqueViews(sfRegistry)[0]['view']).toMatchObject({
        url: expect.stringContaining('lightning/page/home'),
      })

      await page.locator('[data-testid="custom-action-1"]').click()
      await waitFor(
        () => sfRegistry.rumEvents.filter((e) => e['type'] === 'action').length >= 1,
        15000,
        'Timed out waiting for action event'
      )

      await page.getByRole('link', { name: 'Accounts' }).click()
      await page.waitForURL(/Account\/home/i)
      await waitFor(() => uniqueViews(sfRegistry).length >= 2, 20000, 'Timed out waiting for Accounts view')

      expect(uniqueViews(sfRegistry)).toHaveLength(2)
      expect(uniqueViews(sfRegistry)[1]['view']).toMatchObject({
        name: expect.stringContaining('Account'),
      })

      await waitFor(
        () => sfRegistry.rumEvents.filter((e) => e['type'] === 'action').length >= 2,
        15000,
        'Timed out waiting for 2 action events'
      )

      const actions = sfRegistry.rumEvents.filter((e) => e['type'] === 'action')
      const customAction = actions.find((event) => event['action']?.['type'] === 'custom')
      expect(customAction).toBeDefined()
      expect(customAction!['view']).toMatchObject({
        url: expect.stringContaining('lightning/page/home'),
      })

      const navClickAction = actions.find((event) => event['action']?.['type'] === 'click')
      expect(navClickAction).toBeDefined()
      expect(navClickAction!['view']).toMatchObject({
        name: expect.stringContaining('/lightning/page/home'),
      })
    })

  createSalesforceTest('captures resources of every type')
    .withPath('/lightning/page/home')
    .run(async ({ page, sfRegistry, waitFor }) => {
      await waitFor(() => uniqueViews(sfRegistry).length >= 1, 20000, 'Timed out waiting for initial view')

      await page.getByRole('link', { name: 'Accounts' }).click()
      await page.waitForURL(/Account\/home/i)
      await waitFor(() => uniqueViews(sfRegistry).length >= 2, 20000, 'Timed out waiting for Accounts view')

      expect(uniqueViews(sfRegistry)).toHaveLength(2)

      await waitFor(() => sfRegistry.rumResourceEvents.length >= 5, 15000, 'Timed out waiting for resource events')

      const resourcesByType = (type: string) =>
        sfRegistry.rumResourceEvents.filter((event) => event['resource']?.['type'] === type)

      for (const type of ['document', 'other', 'js', 'xhr', 'fetch']) {
        const resources = resourcesByType(type)
        expect(resources.length, `expected at least one ${type} resource`).toBeGreaterThanOrEqual(1)
        expect(resources[0]['resource']?.['url']).toBeTruthy()
        expect(resources[0]['resource']?.['duration']).toBeGreaterThan(0)
      }
    })

  createSalesforceTest('captures custom errors and long tasks')
    .withPath('/lightning/page/home')
    .run(async ({ page, browserName, sfRegistry, waitFor }) => {
      test.skip(browserName !== 'chromium', 'Long Tasks API is Chromium-only')
      await waitFor(() => uniqueViews(sfRegistry).length >= 1, 20000, 'Timed out waiting for initial view')
      expect(uniqueViews(sfRegistry)).toHaveLength(1)
      expect(uniqueViews(sfRegistry)[0]['view']).toMatchObject({
        url: expect.stringContaining('lightning/page/home'),
      })

      await page.locator('[data-testid="custom-error-1"]').click()
      await waitFor(() => sfRegistry.rumErrorEvents.length >= 1, 15000, 'Timed out waiting for error event')

      expect(sfRegistry.rumErrorEvents[0]['error']).toMatchObject({
        message: 'custom error 1',
      })

      await page.locator('[data-testid="long-task"]').click()
      await waitFor(() => sfRegistry.rumLongTaskEvents.length >= 1, 10000, 'Timed out waiting for long task event')

      expect(sfRegistry.rumLongTaskEvents[0]['long_task']).toMatchObject({
        duration: expect.any(Number),
      })
      expect(sfRegistry.rumLongTaskEvents[0]['long_task']?.['duration'] as number).toBeGreaterThan(50)
    })
})
