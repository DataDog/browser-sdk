import { test, expect } from '@playwright/test'
import { createSalesforceTest } from '../../lib/framework/salesforce/createSalesforceTest.ts'

test.describe('Salesforce Lightning — Datadog RUM SDK', () => {
  createSalesforceTest('captures views, custom action, and auto-click actions')
    .withPath('/lightning/page/home')
    .run(async ({ page, sfRegistry, waitForRumEvent, waitForUniqueViews }) => {
      await waitForUniqueViews(1)
      expect(sfRegistry.rumUniqueViewEvents).toHaveLength(1)
      expect(sfRegistry.rumUniqueViewEvents[0]['view']).toMatchObject({
        url: expect.stringContaining('lightning/page/home'),
      })

      await page.locator('[data-testid="custom-action-1"]').click()
      await waitForRumEvent('action', 1)

      await page.getByRole('link', { name: 'Accounts' }).click()
      await page.waitForURL(/Account\/home/i)
      await waitForUniqueViews(2)

      expect(sfRegistry.rumUniqueViewEvents).toHaveLength(2)
      expect(sfRegistry.rumUniqueViewEvents[1]['view']).toMatchObject({
        name: expect.stringContaining('Account'),
      })

      await waitForRumEvent('action', 2)

      const customAction = sfRegistry.rumActionEvents.find((event) => event['action']?.['type'] === 'custom')
      expect(customAction).toBeDefined()
      expect(customAction!['view']).toMatchObject({
        url: expect.stringContaining('lightning/page/home'),
      })

      const navClickAction = sfRegistry.rumActionEvents.find((event) => event['action']?.['type'] === 'click')
      expect(navClickAction).toBeDefined()
      expect(navClickAction!['view']).toMatchObject({
        name: expect.stringContaining('/lightning/page/home'),
      })
    })

  createSalesforceTest('captures resources of every type')
    .withPath('/lightning/page/home')
    .run(async ({ page, sfRegistry, waitForRumEvent, waitForUniqueViews }) => {
      await waitForUniqueViews(1)

      await page.getByRole('link', { name: 'Accounts' }).click()
      await page.waitForURL(/Account\/home/i)
      await waitForUniqueViews(2)

      expect(sfRegistry.rumUniqueViewEvents).toHaveLength(2)

      await waitForRumEvent('resource', 5)

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
    .run(async ({ page, sfRegistry, waitForRumEvent, waitForUniqueViews }) => {
      await waitForUniqueViews(1)
      expect(sfRegistry.rumUniqueViewEvents).toHaveLength(1)
      expect(sfRegistry.rumUniqueViewEvents[0]['view']).toMatchObject({
        url: expect.stringContaining('lightning/page/home'),
      })

      await page.locator('[data-testid="custom-error-1"]').click()
      await waitForRumEvent('error', 1)

      expect(sfRegistry.rumErrorEvents[0]['error']).toMatchObject({
        message: 'custom error 1',
      })

      await page.locator('[data-testid="long-task"]').click()
      await waitForRumEvent('long_task', 1, 10000)

      expect(sfRegistry.rumLongTaskEvents[0]['long_task']).toMatchObject({
        duration: expect.any(Number),
      })
      expect(sfRegistry.rumLongTaskEvents[0]['long_task']?.['duration'] as number).toBeGreaterThan(50)
    })
})
