import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'

test.describe('transport', () => {
  test.describe('batch flushing on beforeunload', () => {
    createTest('use sendBeacon for a batch flushed by bytes_limit during beforeunload')
      // This test reproduces a bug where a batch near the size limit is flushed using fetch
      // instead of sendBeacon when the beforeunload event fires.
      //
      // Scenario:
      // 1. A batch is almost full (close to RECOMMENDED_REQUEST_BYTES_LIMIT = 16 KiB)
      // 2. beforeunload fires and triggers a final view update
      // 3. Adding the view update exceeds the limit → the batch is flushed due to bytes_limit
      // 4. BUG: this flush uses fetch instead of sendBeacon, so it may be cancelled during unload
      // 5. A new batch is created for the view update and flushed via sendBeacon
      //
      // Expected: the bytes_limit flush should use sendBeacon when triggered in the context of a
      // page exit, so that it is not cancelled by the browser.
      .withRum({ telemetrySampleRate: 0 })
      .run(async ({ page, flushEvents, intakeRegistry }) => {
        // Fill the batch close to the 16 KiB limit using a custom action. The action name is sized
        // so that action event is almost at the limit 16KB limit → no flush yet.
        await page.evaluate(() => {
          window.DD_RUM!.addAction('x'.repeat(15000))
        })

        // Navigating away fires beforeunload, which triggers a final view update. Adding the view
        // update (~2KB) to the near-full batch tips it over the limit and causes a bytes_limit
        // flush, which the SDK issues via fetch — and that fetch gets cancelled on page unload.
        await flushEvents()

        // We expect two last RUM batches:
        // 1. The near-full batch containing the large action, flushed due to bytes_limit
        // 2. The final view update batch, flushed due to beforeunload
        const [penultimateBatch, finalBatch] = intakeRegistry.rumRequests.slice(-2)

        // The action event should be present in one of the batches
        expect(
          penultimateBatch.events.some((e) => e.type === 'action') || finalBatch.events.some((e) => e.type === 'action')
        ).toBe(true)

        // Both batches should use sendBeacon so they are not cancelled during page unload.
        // With the bug, penultimateBatch.transport is 'fetch' instead of 'beacon'.
        expect(penultimateBatch.transport).toBe('beacon')
        expect(finalBatch.transport).toBe('beacon')
      })
  })

  test.describe('data compression', () => {
    createTest('send RUM data compressed')
      .withRum({
        compressIntakeRequests: true,
      })
      .run(async ({ flushEvents, intakeRegistry }) => {
        await flushEvents()

        expect(intakeRegistry.rumRequests).toHaveLength(3)

        // The last view update should be sent without compression
        const plainRequests = intakeRegistry.rumRequests.filter((request) => request.encoding === null)
        expect(plainRequests).toHaveLength(2)
        const telemetryEventsRequest = plainRequests.find((request) =>
          request.events.some((event) => event.type === 'telemetry')
        )
        const rumEventsRequest = plainRequests.find((request) => request !== telemetryEventsRequest)
        expect(rumEventsRequest!.events).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'view',
            }),
          ])
        )

        // Other data should be sent encoded
        const deflateRequests = intakeRegistry.rumRequests.filter((request) => request.encoding === 'deflate')
        expect(deflateRequests).toHaveLength(1)
        expect(deflateRequests.flatMap((request) => request.events).length).toBeGreaterThan(0)
      })

    createTest("displays a message if the worker can't be started")
      .withRum({
        compressIntakeRequests: true,
      })
      .withBasePath('/no-blob-worker-csp')
      .run(async ({ browserName, flushEvents, intakeRegistry, withBrowserLogs }) => {
        test.fixme(
          browserName === 'webkit',
          'The worker fails but does not trigger the CSP documentation log on Safari'
        )
        await flushEvents()

        // Some non-deflate request can still be sent because on some browsers the Worker fails
        // asynchronously
        expect(intakeRegistry.rumRequests.filter((request) => request.encoding === 'deflate')).toHaveLength(0)

        withBrowserLogs((logs) => {
          const failedToStartLog = logs.find((log) => log.message.includes('Datadog RUM failed to start'))
          const cspDocLog = logs.find((log) => log.message.includes('Please make sure CSP'))
          expect(failedToStartLog, "'Failed to start' log").toBeTruthy()
          expect(cspDocLog, "'CSP doc' log").toBeTruthy()
        })
      })
  })

  createTest('use fetch instead of sendBeacon for a non-HTTP endpoint on exit')
    .withRum({ telemetrySampleRate: 0, sessionReplaySampleRate: 0 })
    // Override the test proxy with a non-HTTP(S) endpoint to exercise the protocol guard.
    .withRumInit((configuration) => {
      window.DD_RUM!.init({ ...configuration, proxy: () => 'file:///proxy' })
    })
    .run(async ({ page, flushEvents }) => {
      // Store calls outside the page because flushEvents navigates away and destroys its state.
      const transportCalls: string[] = []
      page.on('console', (message) => {
        if (message.text().startsWith('transport:')) {
          transportCalls.push(message.text())
        }
      })

      // Stub the transports in the page context where the SDK calls them during exit.
      await page.evaluate(() => {
        navigator.sendBeacon = () => {
          console.info('transport:beacon')
          return false
        }
        // Resolve fetch locally so the fallback does not attempt to request a file URL.
        window.fetch = () => {
          console.info('transport:fetch')
          return Promise.resolve(new Response())
        }

        window.DD_RUM!.addAction('flush')
      })

      await flushEvents()

      // A non-HTTP(S) endpoint must bypass sendBeacon and use fetch directly.
      expect(transportCalls).toEqual(['transport:fetch'])
    })
})
