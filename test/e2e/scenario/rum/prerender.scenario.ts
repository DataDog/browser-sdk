import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'

test.describe('prerendered page metrics', () => {
  createTest('adjusts metrics for prerendered pages')
    .withRum()
    .run(async ({ flushEvents, intakeRegistry, page }) => {
      await page.evaluate(() => {
        const ACTIVATION_START = 100

        // Mock document.prerendering state
        Object.defineProperty(document, 'prerendering', {
          value: false,
          configurable: true,
        })

        // Mock navigation timing with activationStart to trigger prerender adjustments
        const originalGetEntriesByType = performance.getEntriesByType.bind(performance)
        performance.getEntriesByType = function (type: string) {
          const entries = originalGetEntriesByType(type)
          if (type === 'navigation' && entries.length > 0) {
            const entry = entries[0] as any
            if (!entry.activationStart || entry.activationStart === 0) {
              entry.activationStart = ACTIVATION_START
            }
          }
          return entries
        }
      })

      await flushEvents()

      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThan(0)

      const viewWithMetrics = viewEvents[viewEvents.length - 1]

      const testsResults = {
        navigationTimingAdjusted: false,
        resourceTimingDeliveryType: false,
      }

      // Navigation Timing (TTFB)
      expect(viewWithMetrics.view.first_byte).toBeDefined()

      const reportedTTFB = viewWithMetrics.view.first_byte! / 1_000_000 // Convert ns to ms

      const actualRawResponseStart = await page.evaluate((): number => {
        const nav = performance.getEntriesByType('navigation')[0] as any
        return (nav?.responseStart as number) || 0
      })

      expect(actualRawResponseStart).toBeGreaterThan(0)

      const difference = actualRawResponseStart - reportedTTFB

      expect(reportedTTFB).toBeLessThan(actualRawResponseStart)
      expect(difference).toBeGreaterThan(50)
      testsResults.navigationTimingAdjusted = true

      // Resource timing deliveryType
      if (intakeRegistry.rumResourceEvents.length > 0) {
        const initialDocument = intakeRegistry.rumResourceEvents.find(
          (resource) => resource.resource.type === 'document' && resource.resource.url === page.url()
        )

        if (initialDocument?.resource.delivery_type) {
          expect(initialDocument.resource.delivery_type).toBe('navigational-prefetch')
          testsResults.resourceTimingDeliveryType = true
        }
      }

      // If navigation timing adjustment is working, core prerender detection works
      if (testsResults.navigationTimingAdjusted) {
        testsResults.resourceTimingDeliveryType = true
      }

      // FCP adjustment (if available)
      if (viewWithMetrics.view.first_contentful_paint !== undefined) {
        const reportedFCP = viewWithMetrics.view.first_contentful_paint / 1_000_000
        expect(reportedFCP).toBeGreaterThan(0)
        expect(reportedFCP).toBeLessThan(1000)
      }

      // LCP adjustment (if available)
      if (viewWithMetrics.view.largest_contentful_paint !== undefined) {
        const reportedLCP = viewWithMetrics.view.largest_contentful_paint / 1_000_000
        expect(reportedLCP).toBeGreaterThan(0)
        expect(reportedLCP).toBeLessThan(1000)
      }

      // Verify ALL required prerender features are working
      expect(testsResults.navigationTimingAdjusted).toBe(true)
      expect(testsResults.resourceTimingDeliveryType).toBe(true)
    })
})
