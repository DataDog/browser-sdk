import { test, expect } from '@playwright/test'
import { createTest, html, waitForRequests } from '../../lib/framework'

test.describe('partial view updates', () => {
  createTest('should send a view_update event when the update arrives in a new batch')
    .withRum({
      enableExperimentalFeatures: ['partial_view_updates'],
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      // Flush the initial VIEW so it lands in its own batch. Any update that arrives
      // while a VIEW is still in the batch is handled as opt-1 (full-view upsert, no view_update).
      // Flushing first puts the next update in a fresh batch, triggering opt-2 (view_update).
      await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')))
      await waitForRequests(page)

      // setViewName triggers a view update immediately (no THROTTLE_VIEW_UPDATE_PERIOD delay).
      await page.evaluate(() => {
        window.DD_RUM!.setViewName('updated-name')
      })

      await flushEvents()

      // First event should be type 'view'
      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThanOrEqual(1)
      expect(viewEvents[0].type).toBe('view')

      // Should have at least one view_update
      const viewUpdateEvents = intakeRegistry.rumViewUpdateEvents
      expect(viewUpdateEvents.length).toBeGreaterThanOrEqual(1)

      // All events share the same view.id
      const viewId = viewEvents[0].view.id
      for (const update of viewUpdateEvents) {
        expect(update.view.id).toBe(viewId)
      }
    })

  createTest('should upsert the full VIEW when a view update arrives in the same batch')
    .withRum({
      enableExperimentalFeatures: ['partial_view_updates'],
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      // Trigger a view update without flushing first — it lands in the same batch as the initial VIEW.
      // Optimization 1: the SDK replaces the VIEW in the batch (upsert) and emits no view_update.
      await page.evaluate(() => {
        window.DD_RUM!.setViewName('updated-name')
      })

      await flushEvents()

      // Should have exactly one full VIEW event (the latest state after all in-batch updates)
      expect(intakeRegistry.rumViewEvents.length).toBe(1)

      // Should NOT have any view_update events (opt-1: full VIEW replaced in batch)
      const viewUpdateEvents = intakeRegistry.rumViewUpdateEvents
      expect(viewUpdateEvents).toHaveLength(0)
    })

  createTest('should have strictly increasing document_version across view and view_update events')
    .withRum({
      enableExperimentalFeatures: ['partial_view_updates'],
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      // Flush the initial VIEW first so the subsequent update lands in a new batch (opt-2 path).
      await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')))
      await waitForRequests(page)

      await page.evaluate(() => {
        window.DD_RUM!.setViewName('updated-name')
      })

      await flushEvents()

      // Collect all view-related events (view + view_update) sorted by document_version
      const allViewRelatedEvents = [
        ...intakeRegistry.rumViewEvents.map((e) => ({ _dd: e._dd })),
        ...intakeRegistry.rumViewUpdateEvents.map((e) => ({ _dd: e._dd })),
      ].sort((a, b) => a._dd.document_version - b._dd.document_version)

      expect(allViewRelatedEvents.length).toBeGreaterThanOrEqual(2)

      // Verify monotonic increase
      for (let i = 1; i < allViewRelatedEvents.length; i++) {
        expect(allViewRelatedEvents[i]._dd.document_version).toBeGreaterThan(
          allViewRelatedEvents[i - 1]._dd.document_version
        )
      }
    })

  createTest('should only send view events when feature flag is not enabled')
    .withRum()
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => {
        window.DD_RUM!.addAction('test-action')
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
    .withBody(html`
      <a id="nav-link">Navigate</a>
      <script>
        document.getElementById('nav-link').addEventListener('click', () => {
          history.pushState(null, '', '/new-page')
        })
      </script>
    `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      // Trigger a route change to create a new view
      await page.click('#nav-link')

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
      // Flush the initial VIEW first so the update lands in a new batch (opt-2 path).
      await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')))
      await waitForRequests(page)

      await page.evaluate(() => {
        window.DD_RUM!.setViewName('updated-name')
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
        expect(event._dd.document_version).toBeDefined()
        expect(event.date).toBeDefined()
      }
    })

  createTest('should send a full VIEW event (not view_update) with is_active false when view ends')
    .withRum({
      enableExperimentalFeatures: ['partial_view_updates'],
    })
    .withBody(html`
      <a id="nav-link">Navigate</a>
      <script>
        document.getElementById('nav-link').addEventListener('click', () => {
          history.pushState(null, '', '/other-page')
        })
      </script>
    `)
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      // Navigate to trigger view end on the first view
      await page.click('#nav-link')

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
      // Flush the initial VIEW first so it arrives at the intake in its own batch.
      // If the initial VIEW and the 102 updates were in the same batch, optimization 1 would
      // keep upserting the full VIEW (no view_update), and the checkpoint would replace it
      // in the same slot — we'd see only one VIEW event total instead of two.
      // Flushing first ensures subsequent updates go through the opt-2 path, where the
      // checkpoint sends a second full VIEW in a later batch.
      // Dispatching beforeunload triggers the SDK batch send without navigating away.
      await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')))
      await waitForRequests(page)

      // Use setViewName to trigger unthrottled view updates (unlike addAction which is
      // throttled to THROTTLE_VIEW_UPDATE_PERIOD=3s, setViewName calls triggerViewUpdate directly).
      // We need more than PARTIAL_VIEW_UPDATE_CHECKPOINT_INTERVAL (100) updates to trigger a checkpoint.
      // All calls are batched in a single evaluate to avoid 102 round-trips to the browser.
      await page.evaluate((count) => {
        for (let i = 0; i < count; i++) {
          window.DD_RUM!.setViewName(`step-${i}`)
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
