import { test, expect } from '@playwright/test'
import { createTest } from '../lib/framework'

test.describe('transport', () => {
  test.describe('data compression', () => {
    createTest('send RUM data compressed')
      .withRum({
        compressIntakeRequests: true,
      })
      .run(async ({ flushEvents, intakeRegistry }) => {
        await flushEvents()

        expect(intakeRegistry.rumRequests).toHaveLength(2)

        const plainRequest = intakeRegistry.rumRequests.find((request) => request.encoding === null)
        const deflateRequest = intakeRegistry.rumRequests.find((request) => request.encoding === 'deflate')

        // The last view update should be sent without compression
        expect(plainRequest?.events).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'view',
            }),
          ])
        )

        // Other data should be sent encoded
        expect(deflateRequest!.events.length).toBeGreaterThan(0)
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
