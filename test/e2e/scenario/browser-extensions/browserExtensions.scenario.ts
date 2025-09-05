import path from 'path'
import { test, expect } from '@playwright/test'
import { createTest } from '../../lib/framework'

const pathToBaseExtension = path.join(__dirname, '../../../../test/apps/base-extension')

const warningMessage =
  'Datadog Browser SDK: Running the Browser SDK in a Web extension content script is discouraged and will be forbidden in a future major release unless the `allowedTrackingOrigins` option is provided.'
const errorMessage = 'Datadog Browser SDK: SDK initialized on a non-allowed domain.'

// TODO: the recorder is lazy loaded and does not works in an browser extension content script
const DISABLE_SESSION_REPLAY_CONFIGURATION = {
  sessionReplaySampleRate: 0,
}

test.describe('browser extensions @only', () => {
  createTest(
    'SDK is initialized in an unsupported environment without allowedTrackingOrigins and warns when used in content script'
  )
    .withExtension(pathToBaseExtension)
    .withRum({ ...DISABLE_SESSION_REPLAY_CONFIGURATION })
    .run(async ({ withBrowserLogs, flushEvents }) => {
      await flushEvents()

      withBrowserLogs((logs) => {
        expect(logs).toContainEqual(
          expect.objectContaining({
            level: 'warning',
            message: warningMessage,
          })
        )
      })
    })

  createTest('SDK with correct allowedTrackingOrigins parameter works correctly for both RUM and Logs')
    .withExtension(pathToBaseExtension)
    .withRum({ allowedTrackingOrigins: ['LOCATION_ORIGIN'], ...DISABLE_SESSION_REPLAY_CONFIGURATION })
    .run(async ({ withBrowserLogs, flushEvents, intakeRegistry }) => {
      await flushEvents()

      expect(intakeRegistry.rumViewEvents).toHaveLength(1)

      withBrowserLogs((logs) => {
        expect(logs.length).toBe(0)
      })
    })

  createTest('SDK with incorrect allowedTrackingOrigins shows error message for both RUM and Logs')
    .withExtension(pathToBaseExtension)
    .withRum({ allowedTrackingOrigins: ['https://app.example.com'], ...DISABLE_SESSION_REPLAY_CONFIGURATION })
    .run(async ({ withBrowserLogs, flushEvents, intakeRegistry }) => {
      await flushEvents()

      expect(intakeRegistry.rumViewEvents).toHaveLength(0)

      withBrowserLogs((logs) => {
        expect(logs).toContainEqual(
          expect.objectContaining({
            level: 'error',
            message: errorMessage,
          })
        )
      })
    })
})
