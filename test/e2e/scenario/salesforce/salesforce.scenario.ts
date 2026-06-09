import { test, expect } from '@playwright/test'
import { createSalesforceTest } from '../../lib/framework'

function uniqueViews(sfRegistry: { rumViewEvents: Array<Record<string, any>> }) {
  return [...new Map(sfRegistry.rumViewEvents.map((e) => [e['view']?.['id'], e])).values()]
}

test.describe('Salesforce Lightning — Datadog RUM SDK', () => {
  createSalesforceTest('captures views, custom action, and auto-click actions')
    .withPath('/lightning/page/home')
    .run(async ({ page, sfRegistry, waitFor }) => {
      await page.locator('[data-testid="custom-action-1"]').click()
      await page.getByRole('link', { name: 'Accounts' }).click()
      await page.waitForURL(/Account\/home/i)

      await waitFor(
        () => uniqueViews(sfRegistry).length >= 2 && sfRegistry.rumEvents.filter((e) => e['type'] === 'action').length >= 2,
        20000,
        'Timed out waiting for 2 views and 2 actions'
      )

      const views = uniqueViews(sfRegistry)
      expect(views).toHaveLength(2)
      expect(views[0]['view']).toMatchObject({ url: expect.stringContaining('lightning/page/home') })
      expect(views[1]['view']).toMatchObject({ name: expect.stringContaining('Account') })

      const actions = sfRegistry.rumEvents.filter((e) => e['type'] === 'action')
      const customAction = actions.find((e) => e['action']?.['type'] === 'custom')
      expect(customAction).toBeDefined()
      expect(customAction!['view']).toMatchObject({ url: expect.stringContaining('lightning/page/home') })

      const navClickAction = actions.find((e) => e['action']?.['type'] === 'click')
      expect(navClickAction).toBeDefined()
      expect(navClickAction!['view']).toMatchObject({ name: expect.stringContaining('/lightning/page/home') })
    })

  createSalesforceTest('captures resources of every type')
    .withPath('/lightning/page/home')
    .run(async ({ page, sfRegistry, waitFor }) => {
      await page.getByRole('link', { name: 'Accounts' }).click()
      await page.waitForURL(/Account\/home/i)

      await waitFor(
        () => uniqueViews(sfRegistry).length >= 2 && sfRegistry.rumResourceEvents.length >= 5,
        20000,
        'Timed out waiting for 2 views and 5 resource events'
      )

      expect(uniqueViews(sfRegistry)).toHaveLength(2)

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

      await page.locator('[data-testid="custom-error-1"]').click()
      await page.locator('[data-testid="long-task"]').click()

      await waitFor(
        () => sfRegistry.rumErrorEvents.length >= 1 && sfRegistry.rumLongTaskEvents.length >= 1,
        20000,
        'Timed out waiting for error and long task events'
      )

      expect(sfRegistry.rumErrorEvents[0]['error']).toMatchObject({ message: 'custom error 1' })

      expect(sfRegistry.rumLongTaskEvents[0]['long_task']).toMatchObject({ duration: expect.any(Number) })
      expect(sfRegistry.rumLongTaskEvents[0]['long_task']?.['duration'] as number).toBeGreaterThan(50)
    })
})
