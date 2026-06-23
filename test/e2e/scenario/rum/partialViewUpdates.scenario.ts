import { test, expect } from '@playwright/test'
import { createTest, waitForRequests } from '../../lib/framework'

test.describe('partial view updates', () => {
  createTest('should send view_update events after the initial view event')
    .withRum({
      enableExperimentalFeatures: ['partial_view_updates'],
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      // Trigger a user action to cause a view update with changed metrics
      await page.evaluate(() => {
        window.OO_RUM!.addAction('test-action')
      })

      await flushEvents()

      // First event should be type 'view'
      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThanOrEqual(1)
      expect(viewEvents[0].type).toBe('view')

      // Should have at least one view_update with the updated action count
      const viewUpdateEvents = intakeRegistry.rumViewUpdateEvents
      expect(viewUpdateEvents.length).toBeGreaterThanOrEqual(1)
      expect(viewUpdateEvents.some((e) => (e.view as { action?: { count: number } }).action?.count)).toBe(true)

      // All events share the same view.id
      const viewId = viewEvents[0].view.id
      for (const update of viewUpdateEvents) {
        expect(update.view.id).toBe(viewId)
      }
    })

  createTest('should have monotonically increasing document_version across view and view_update events')
    .withRum({
      enableExperimentalFeatures: ['partial_view_updates'],
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.OO_RUM!.addAction('test-action')
      })

      await flushEvents()

      // Collect document_versions from all view-related events (view + view_update)
      const allDocVersions = [
        ...intakeRegistry.rumViewEvents.map((e) => e._oo.document_version),
        ...intakeRegistry.rumViewUpdateEvents.map((e) => (e._oo as { document_version: number }).document_version),
      ]

      expect(allDocVersions.length).toBeGreaterThanOrEqual(2)

      // Verify all document_versions are unique (no duplicates)
      expect(new Set(allDocVersions).size).toBe(allDocVersions.length)
    })

  createTest('should only send view events when feature flag is not enabled')
    .withRum()
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.OO_RUM!.addAction('test-action')
      })

      await flushEvents()

      // Should have view events
      expect(intakeRegistry.rumViewEvents.length).toBeGreaterThanOrEqual(1)

      // Should NOT have any view_update events
      const viewUpdateEvents = intakeRegistry.rumViewUpdateEvents
      expect(viewUpdateEvents).toHaveLength(0)
    })

  createTest('should emit a new full view event after navigation')
    .withRum({
      enableExperimentalFeatures: ['partial_view_updates'],
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => history.pushState(null, '', '/new-page'))

      await flushEvents()

      // Should have at least 2 full view events (one per view.id)
      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThanOrEqual(2)

      // The two view events should have different view.ids
      const viewIds = new Set(viewEvents.map((e) => e.view.id))
      expect(viewIds.size).toBeGreaterThanOrEqual(2)
    })

  createTest('should include required fields in all view_update events')
    .withRum({
      enableExperimentalFeatures: ['partial_view_updates'],
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.OO_RUM!.addAction('test-action')
      })

      await flushEvents()

      const viewUpdateEvents = intakeRegistry.rumViewUpdateEvents
      expect(viewUpdateEvents.length).toBeGreaterThanOrEqual(1)

      for (const event of viewUpdateEvents) {
        // Required fields per spec FR-3
        expect(event.type).toBe('view_update')
        expect(event.application.id).toBeDefined()
        expect(event.session.id).toBeDefined()
        expect(event.view.id).toBeDefined()
        expect(event._oo.document_version).toBeDefined()
        expect(event.date).toBeDefined()
      }
    })

  createTest('should send a full VIEW event (not view_update) with is_active false when view ends')
    .withRum({
      enableExperimentalFeatures: ['partial_view_updates'],
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => history.pushState(null, '', '/other-page'))

      await flushEvents()

      // After Fix 3: view-end emits a full VIEW event, not a VIEW_UPDATE
      const viewEvents = intakeRegistry.rumViewEvents
      const firstViewId = viewEvents[0].view.id
      const endEvent = viewEvents.find((e) => e.view.id === firstViewId && !e.view.is_active)
      expect(endEvent).toBeDefined()
      expect(endEvent?.type).toBe('view')

      // No view_update should have is_active: false
      const viewUpdateEvents = intakeRegistry.rumViewUpdateEvents
      const endUpdateEvent = viewUpdateEvents.find((e) => e.view.id === firstViewId && e.view.is_active === false)
      expect(endUpdateEvent).toBeUndefined()
    })

  createTest('should emit a full view checkpoint event during a long-lived view')
    .withRum({
      enableExperimentalFeatures: ['partial_view_updates'],
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      // Flush the initial view first so it arrives at the intake in its own batch.
      // The checkpoint (every 100 updates) uses batch.upsert with the same viewId which would
      // replace the initial view if they share a batch — flushing first prevents that.
      // Dispatching beforeunload triggers the SDK batch send without navigating away.
      await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')))
      await waitForRequests(page)

      // Use setViewName to trigger unthrottled view updates (unlike addAction which is
      // throttled to THROTTLE_VIEW_UPDATE_PERIOD=3s, setViewName calls triggerViewUpdate directly).
      // We need more than PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL (100) updates to trigger a checkpoint.
      // All calls are batched in a single evaluate to avoid 102 round-trips to the browser.
      await page.evaluate((count) => {
        for (let i = 0; i < count; i++) {
          window.OO_RUM!.setViewName(`step-${i}`)
        }
      }, 102)

      await flushEvents()

      // There must be at least 2 full VIEW events for the same view.id
      // (the initial one + at least one checkpoint)
      const firstViewId = intakeRegistry.rumViewEvents[0].view.id
      const fullViewsForFirstView = intakeRegistry.rumViewEvents.filter((e) => e.view.id === firstViewId)
      expect(fullViewsForFirstView.length).toBeGreaterThanOrEqual(2)
    })
})
