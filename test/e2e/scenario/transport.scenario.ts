import type { TrustedTypesWindow } from 'trusted-types/lib'
import { test, expect } from '@playwright/test'
import { createTest, bundleSetup } from '../lib/framework'

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

    createTest('use sendBeacon when the final view update pushes the batch over the size limit')
      // The final view update replaces the view already in the batch. When it grows the view
      // enough, the batch flushed on beforeunload goes over 16 KiB, too big for a single beacon.
      // Without splitting it, the SDK sends it with fetch, which WebKit cancels as soon as the
      // navigation starts, so the whole batch is lost.
      .withRum({ telemetrySampleRate: 0 })
      .run(async ({ page, flushEvents, intakeRegistry }) => {
        // View updates are throttled for 3s. Wait for any update scheduled during page load, so
        // the next one only happens when the page exits.
        await page.waitForTimeout(3500)

        await page.evaluate(() => {
          // About 8 KB: with the view and resources already in the batch (about 5 KB), the batch
          // stays under the 16 KiB limit and isn't flushed yet.
          window.DD_RUM!.addAction('x'.repeat(8000))
          // The view update that adds this context is throttled until the page exits. It then
          // grows the view in the batch by about 9 KB, which pushes the batch over the limit.
          window.DD_RUM!.setViewContextProperty('padding', 'y'.repeat(9000))
        })

        await flushEvents()

        const actionRequest = intakeRegistry.rumRequests.find((request) =>
          request.events.some((event) => event.type === 'action')
        )
        const paddedViewRequest = intakeRegistry.rumRequests.find((request) =>
          request.events.some((event) => event.type === 'view' && event.context?.padding)
        )
        expect(actionRequest?.transport).toBe('beacon')
        expect(paddedViewRequest?.transport).toBe('beacon')
      })
  })

  test.describe('data compression', () => {
    test.describe('Trusted Types worker', () => {
      test.skip(({ browserName }) => browserName !== 'chromium', 'Trusted Types enforcement requires Chromium')

      createTest('send compressed RUM data with a TrustedScriptURL worker under Trusted Types enforcement')
        .withSetup(bundleSetup)
        .withBasePath('/trusted-worker-csp')
        .withRum({
          compressIntakeRequests: true,
          sessionReplaySampleRate: 0,
          workerUrl: '/worker.js',
        })
        .withRumInit((configuration) => {
          const { trustedTypes } = window as Window & Pick<TrustedTypesWindow, 'trustedTypes'>
          if (!trustedTypes) {
            throw new Error('Trusted Types are required for this test')
          }
          const policy = trustedTypes.createPolicy('dd-test-worker', { createScriptURL: (url) => url })
          configuration.workerUrl = policy.createScriptURL('/worker.js')
          window.DD_RUM!.init(configuration)
        })
        .run(async ({ page, flushEvents, intakeRegistry, withBrowserLogs }) => {
          const trustedTypesState = await page.evaluate(() => {
            const { trustedTypes } = window as Window & Pick<TrustedTypesWindow, 'trustedTypes'>
            let rejectsString = false
            try {
              const worker = new Worker('/worker.js')
              worker.terminate()
            } catch (error) {
              rejectsString = error instanceof TypeError
            }
            return {
              available: !!trustedTypes,
              workerUrlIsTrusted: trustedTypes?.isScriptURL(window.DD_RUM!.getInitConfiguration()?.workerUrl),
              rejectsString,
            }
          })
          expect(trustedTypesState).toEqual({ available: true, workerUrlIsTrusted: true, rejectsString: true })
          await page.evaluate(() => {
            window.DD_RUM!.addAction('trusted-worker', { padding: 'x'.repeat(20000) })
          })
          await flushEvents()
          const deflateRequests = intakeRegistry.rumRequests.filter((request) => request.encoding === 'deflate')
          expect(deflateRequests.length).toBeGreaterThan(0)
          expect(deflateRequests.flatMap((request) => request.events).some((event) => event.type === 'action')).toBe(
            true
          )
          withBrowserLogs((logs) => {
            const errors = logs.filter((log) => log.level === 'error')
            const isExpectedError = (message: string) => message.includes("requires 'TrustedScriptURL' assignment")
            expect(errors.filter((log) => isExpectedError(log.message))).toHaveLength(1)
            expect(errors.filter((log) => !isExpectedError(log.message))).toHaveLength(0)
          })
        })
    })

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
})
