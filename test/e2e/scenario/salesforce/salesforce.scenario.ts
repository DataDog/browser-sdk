import { test, expect } from '@playwright/test'
import { createSalesforceTest } from '../../lib/framework/salesforce/createSalesforceTest.ts'

test.describe('Salesforce Lightning — Datadog RUM SDK', () => {
  // Test 1: views, custom actions, and auto-click actions across two Lightning pages
  createSalesforceTest('captures views, custom action, and auto-click actions')
    .withPath('/lightning/page/home')
    .run(async ({ page, sfRegistry, waitForRumEvent, waitForUniqueViews }) => {
      // Initial view on the home page
      await waitForUniqueViews(1)
      expect(sfRegistry.rumUniqueViewEvents).toHaveLength(1)
      expect(sfRegistry.rumUniqueViewEvents[0]['view']).toMatchObject({
        url: expect.stringContaining('lightning/page/home'),
      })

      // Custom Action 1 — calls DD_RUM.addAction explicitly
      await page.locator('[data-testid="custom-action-1"]').click()
      await waitForRumEvent('action', 1)

      // SPA-navigate to Product Explorer via the app nav bar
      await page.getByRole('link', { name: 'Product Explorer' }).click()
      await page.waitForURL(/Product_Explorer/i)
      // Wait until events from a second distinct view.id appear
      await waitForUniqueViews(2)

      expect(sfRegistry.rumUniqueViewEvents).toHaveLength(2)
      expect(sfRegistry.rumUniqueViewEvents[1]['view']).toMatchObject({
        name: expect.stringContaining('Product_Explorer'),
      })

      // Click the Mountain category checkbox (auto-tracked click action).
      // Pierce the lightning-input shadow root; force: true bypasses the SLDS <span> that
      // sits on top and intercepts pointer events.
      await page
        .locator('lightning-input[data-filter="categories"][data-value="Mountain"]')
        .getByRole('checkbox')
        .click({ force: true })
      await waitForRumEvent('action', 2)

      // First action: the explicit custom action — view must be home
      const customAction = sfRegistry.rumActionEvents.find(
        (a) => a['action']?.['type'] === 'custom'
      )
      expect(customAction).toBeDefined()
      expect(customAction!['view']).toMatchObject({
        url: expect.stringContaining('lightning/page/home'),
      })

      // Second action: auto-click on the Product Explorer nav link.
      // Tied to the view active at click time (home), not the destination.
      const productExplorerAction = sfRegistry.rumActionEvents.find(
        (a) =>
          a['action']?.['type'] === 'click' &&
          String(a['action']?.['target']?.['name'] ?? '')
            .toLowerCase()
            .includes('product explorer')
      )
      expect(productExplorerAction).toBeDefined()
      expect(productExplorerAction!['view']).toMatchObject({
        name: '/lightning/page/home',
      })
    })

  // Test 2: resource events across page loads
  createSalesforceTest('captures resources of every type')
    .withPath('/lightning/page/home')
    .run(async ({ page, sfRegistry, waitForRumEvent, waitForUniqueViews }) => {
      await waitForUniqueViews(1)

      // Navigate to Product Explorer to load more resources
      await page.getByRole('link', { name: 'Product Explorer' }).click()
      await page.waitForURL(/Product_Explorer/i)
      await waitForUniqueViews(2)

      expect(sfRegistry.rumUniqueViewEvents).toHaveLength(2)

      // Wait for a batch of resource events to accumulate
      await waitForRumEvent('resource', 5)

      const resourcesByType = (type: string) =>
        sfRegistry.rumResourceEvents.filter((r) => r['resource']?.['type'] === type)

      // CSS is loaded before SDK init so it is not captured;
      // document, other, js, image, xhr, fetch are all present post-init
      for (const type of ['document', 'other', 'js', 'image', 'xhr', 'fetch']) {
        const resources = resourcesByType(type)
        expect(resources.length, `expected at least one ${type} resource`).toBeGreaterThanOrEqual(1)
        expect(resources[0]['resource']?.['url']).toBeTruthy()
        expect(resources[0]['resource']?.['duration']).toBeGreaterThan(0)
      }
    })

  // Test 3: custom errors and long tasks
  createSalesforceTest('captures custom errors and long tasks')
    .withPath('/lightning/n/Product_Explorer')
    .run(async ({ page, sfRegistry, waitForRumEvent, waitForUniqueViews }) => {
      // Initial view must be Product Explorer
      await waitForUniqueViews(1)
      expect(sfRegistry.rumUniqueViewEvents).toHaveLength(1)
      expect(sfRegistry.rumUniqueViewEvents[0]['view']).toMatchObject({
        name: expect.stringContaining('Product_Explorer'),
      })

      // SPA-navigate back to home where the customActionButtons component lives
      await page.getByRole('link', { name: 'Home' }).click()
      await page.waitForURL(/lightning\/page\/home/i)
      await waitForUniqueViews(2)

      expect(sfRegistry.rumUniqueViewEvents).toHaveLength(2)

      // Trigger a custom error
      await page.locator('[data-testid="custom-error-1"]').click()
      await waitForRumEvent('error', 1)

      expect(sfRegistry.rumErrorEvents[0]['error']).toMatchObject({
        message: 'custom error 1',
      })

      // Trigger a long task (750ms busy-wait on the main thread)
      await page.locator('[data-testid="long-task"]').click()
      await waitForRumEvent('long_task', 1, 10000)

      expect(sfRegistry.rumLongTaskEvents[0]['long_task']).toMatchObject({
        duration: expect.any(Number),
      })
      expect(sfRegistry.rumLongTaskEvents[0]['long_task']?.['duration'] as number).toBeGreaterThan(50)
    })
})
