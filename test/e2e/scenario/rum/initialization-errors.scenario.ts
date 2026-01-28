import { test, expect } from '@playwright/test'
import { createTest, html } from '../../lib/framework'

test.describe('RUM initialization errors', () => {
  test.describe('captures session manager initialization error in first batch', () => {
    // Block session manager cookie writes to trigger initialization error during preStart
    const BLOCK_SESSION_MANAGER = html`
      <script>
        const originalDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
        Object.defineProperty(Document.prototype, 'cookie', {
          get: () => originalDescriptor.get.call(document),
          set: (value) => {
            if (value.includes('_dd_s=')) {
              throw new Error('Session manager initialization blocked for testing')
            }
            originalDescriptor.set.call(document, value)
          },
        })
      </script>
    `

    createTest('error appears in first batch sent to intake')
      .withHead(BLOCK_SESSION_MANAGER)
      .withRum()
      .run(async ({ intakeRegistry, flushEvents }) => {
        await flushEvents()

        // Verify IntakeRegistry captured the error
        expect(intakeRegistry.telemetryErrorEvents).toHaveLength(1)
        const error = intakeRegistry.telemetryErrorEvents[0]

        // Verify error payload structure
        expect(error.service).toEqual('browser-rum-sdk')
        expect(error.telemetry.status).toBe('error')
        expect(error.telemetry.type).toBe('log')
        expect(error.telemetry.message).toContain('Session manager initialization blocked')
        expect(error.telemetry.error!.kind).toBe('Error')

        // CRITICAL: Verify error is in FIRST batch
        expect(intakeRegistry.rumRequests.length).toBeGreaterThan(0)
        const firstBatch = intakeRegistry.rumRequests[0]
        const telemetryEventsInFirstBatch = firstBatch.events.filter(
          (event) => event.type === 'telemetry' && event.telemetry.status === 'error'
        )

        // Confirm at least one telemetry error event is in the first batch
        expect(telemetryEventsInFirstBatch.length).toBeGreaterThan(0)
        const firstBatchError = telemetryEventsInFirstBatch[0]
        expect(firstBatchError.telemetry.message).toContain('Session manager initialization blocked')

        // Clear registry to pass teardown validation (test intentionally generates errors)
        intakeRegistry.empty()
      })
  })
})
