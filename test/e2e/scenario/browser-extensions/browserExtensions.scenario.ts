import path from 'path'
import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'

// TODO: the recorder is lazy loaded and does not works in an browser extension content script
const DISABLE_SESSION_REPLAY_CONFIGURATION = { sessionReplaySampleRate: 0 }

const EXTENSIONS = [
  [path.join(__dirname, '../../../../test/apps/base-extension'), 'bundle'],
  [path.join(__dirname, '../../../../test/apps/cdn-extension'), 'cdn'],
] as const

const WARNING_MESSAGE =
  'Datadog Browser SDK: Running the Browser SDK in a Web extension content script is discouraged and will be forbidden in a future major release unless the `allowedTrackingOrigins` option is provided.'
const ERROR_MESSAGE = 'Datadog Browser SDK: SDK initialized on a non-allowed domain.'

test.describe('browser extensions', () => {
  for (const [path, name] of EXTENSIONS) {
    test.describe(`with ${name} extension`, () => {
      createTest('should warn and start tracking when SDK is initialized in an unsupported environment')
        .withExtension(path)
        .withRum(DISABLE_SESSION_REPLAY_CONFIGURATION)
        .run(async ({ withBrowserLogs, flushEvents, intakeRegistry }) => {
          await flushEvents()

          expect(intakeRegistry.rumViewEvents).toHaveLength(1)

          withBrowserLogs((logs) => {
            expect(logs).toContainEqual(
              expect.objectContaining({
                level: 'warning',
                message: WARNING_MESSAGE,
              })
            )
          })
        })

      createTest('should start tracking when allowedTrackingOrigins matches current domain')
        .withExtension(path)
        .withRum({ allowedTrackingOrigins: ['LOCATION_ORIGIN'], ...DISABLE_SESSION_REPLAY_CONFIGURATION })
        .run(async ({ withBrowserLogs, flushEvents, intakeRegistry }) => {
          await flushEvents()

          expect(intakeRegistry.rumViewEvents).toHaveLength(1)

          withBrowserLogs((logs) => expect(logs.length).toBe(0))
        })

      createTest('should not start tracking when allowedTrackingOrigins does not match current domain')
        .withExtension(path)
        .withRum({ allowedTrackingOrigins: ['https://app.example.com'], ...DISABLE_SESSION_REPLAY_CONFIGURATION })
        .run(async ({ withBrowserLogs, flushEvents, intakeRegistry }) => {
          await flushEvents()

          expect(intakeRegistry.rumViewEvents).toHaveLength(0)

          withBrowserLogs((logs) => {
            expect(logs).toContainEqual(
              expect.objectContaining({
                level: 'error',
                message: ERROR_MESSAGE,
              })
            )
          })
        })
    })
  }
})
