import { createTest, flushEvents } from '../lib/framework'
import { getBrowserName, getPlatformName, withBrowserLogs } from '../lib/helpers/browser'

describe('transport', () => {
  describe('data compression', () => {
    createTest('send RUM data compressed')
      .withRum({
        compressIntakeRequests: true,
      })
      .run(async ({ intakeRegistry }) => {
        await flushEvents()

        expect(intakeRegistry.rumRequests.length).toBe(2)

        const plainRequest = intakeRegistry.rumRequests.find((request) => request.encoding === null)
        const deflateRequest = intakeRegistry.rumRequests.find((request) => request.encoding === 'deflate')

        // The last view update should be sent without compression
        expect(plainRequest!.events).toEqual([
          jasmine.objectContaining({
            type: 'view',
          }),
        ])

        // Other data should be sent encoded
        expect(deflateRequest!.events.length).toBeGreaterThan(0)
      })

    // Ignore this test on Safari desktop and Firefox because the Worker actually works even with
    // CSP restriction.
    // TODO: Remove this condition when upgrading to Safari 15 and Firefox 99
    if (!((getBrowserName() === 'safari' && getPlatformName() === 'macos') || getBrowserName() === 'firefox')) {
      createTest("displays a message if the worker can't be started")
        .withRum({
          compressIntakeRequests: true,
        })
        .withBasePath('/no-blob-worker-csp')
        .run(async ({ intakeRegistry }) => {
          await flushEvents()

          expect(intakeRegistry.rumRequests.filter((request) => request.encoding === 'deflate').length).toBe(0)

          // Compression is disabled but requests are still sent uncompressed
          // 6 requests are sent: 1 telemetry, 1 view, 1 CSP error, and 3 resources
          expect(intakeRegistry.rumRequests.filter((request) => request.encoding === null)[0].events.length).toBe(6)

          await withBrowserLogs((logs) => {
            const failedToStartLog = logs.find((log) =>
              log.message.includes('Datadog RUM: no compression worker available')
            )
            const cspDocLog = logs.find((log) => log.message.includes('Please make sure CSP'))
            expect(failedToStartLog).withContext("'Failed to start' log").toBeTruthy()
            expect(cspDocLog).withContext("'CSP doc' log").toBeTruthy()
          })
        })
    }
  })
})
