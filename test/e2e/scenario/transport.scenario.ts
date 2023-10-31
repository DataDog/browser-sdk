import { ExperimentalFeature } from '@datadog/browser-core'
import { createTest, flushEvents } from '../lib/framework'
import { getBrowserName, getPlatformName, withBrowserLogs } from '../lib/helpers/browser'

describe('transport', () => {
  describe('data compression', () => {
    createTest('send RUM data compressed')
      .withRum({
        enableExperimentalFeatures: [ExperimentalFeature.COMPRESS_BATCH],
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
          enableExperimentalFeatures: [ExperimentalFeature.COMPRESS_BATCH],
        })
        .withBasePath('/no-blob-worker-csp')
        .run(async ({ intakeRegistry }) => {
          await flushEvents()

          // Some non-deflate request can still be sent because on some browsers the Worker fails
          // asynchronously
          expect(intakeRegistry.rumRequests.filter((request) => request.encoding === 'deflate').length).toBe(0)

          await withBrowserLogs((logs) => {
            const failedToStartLog = logs.find((log) => log.message.includes('Datadog RUM failed to start'))
            const cspDocLog = logs.find((log) => log.message.includes('Please make sure CSP'))
            expect(failedToStartLog).withContext("'Failed to start' log").toBeTruthy()
            expect(cspDocLog).withContext("'CSP doc' log").toBeTruthy()
          })
        })
    }
  })
})
