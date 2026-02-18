import { test, expect } from '@playwright/test'
import { createTest, html } from '../../lib/framework'

// Helper: extract view_update events from all RUM events
// (intakeRegistry.rumViewEvents only returns type==='view')
function getViewUpdateEvents(intakeRegistry: { rumEvents: any[] }) {
  return intakeRegistry.rumEvents.filter((e: any) => e.type === 'view_update')
}

test.describe('partial view updates', () => {
  createTest('should send view_update events after the initial view event')
    .withRum({
      enableExperimentalFeatures: ['partial_view_updates'],
    })
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      // Trigger a user action to cause a view update with changed metrics
      await page.evaluate(() => {
        window.DD_RUM!.addAction('test-action')
      })

      await flushEvents()

      // First event should be type 'view'
      const viewEvents = intakeRegistry.rumViewEvents
      expect(viewEvents.length).toBeGreaterThanOrEqual(1)
      expect(viewEvents[0].type).toBe('view')

      // Should have at least one view_update
      const viewUpdateEvents = getViewUpdateEvents(intakeRegistry)
      expect(viewUpdateEvents.length).toBeGreaterThanOrEqual(1)

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
        window.DD_RUM!.addAction('test-action')
      })

      await flushEvents()

      // Collect all view-related events (view + view_update) sorted by document_version
      const allViewRelatedEvents = [
        ...intakeRegistry.rumViewEvents,
        ...getViewUpdateEvents(intakeRegistry),
      ].sort((a: any, b: any) => a._dd.document_version - b._dd.document_version)

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
      const viewUpdateEvents = getViewUpdateEvents(intakeRegistry)
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
      await page.evaluate(() => {
        window.DD_RUM!.addAction('test-action')
      })

      await flushEvents()

      const viewUpdateEvents = getViewUpdateEvents(intakeRegistry)
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

  createTest('should send view_update with is_active false when view ends')
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

      const viewUpdateEvents = getViewUpdateEvents(intakeRegistry)

      // Find the view_update that marks the first view as inactive
      const firstViewId = intakeRegistry.rumViewEvents[0].view.id
      const endEvent = viewUpdateEvents.find(
        (e: any) => e.view.id === firstViewId && e.view.is_active === false
      )
      expect(endEvent).toBeDefined()
    })
})
