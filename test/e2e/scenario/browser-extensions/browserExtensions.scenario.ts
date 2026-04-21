import path from 'path'
import { test, expect } from '@playwright/test'
import type { BrowserLog } from '../../lib/framework'
import { createTest, createExtension, createCrossOriginScriptUrls, formatConfiguration } from '../../lib/framework'

const ERROR_DOES_NOT_HAVE_ALLOWED_TRACKING_ORIGIN =
  'Datadog Browser SDK: Running the Browser SDK in a Web extension content script is forbidden unless the `allowedTrackingOrigins` option is provided.'
const ERROR_MESSAGE = 'Datadog Browser SDK: SDK initialized on a non-allowed domain.'

const BASE_PATH = path.join(process.cwd(), 'test/apps')
const EXTENSIONS = ['base-extension', 'cdn-extension']

// NOTE: logs might contain a warning about the SDK being loaded twice when using the npm config
// because the SDK is loaded even though it's not initialized.
// We ignore it here because it's not relevant to the test.
const isNotSdkLoadedMoreThanOnce = (log: BrowserLog) => !log.message.includes('SDK is loaded more than once')

test.describe('browser extensions', () => {
  for (const name of EXTENSIONS) {
    test.describe(`with ${name} extension`, () => {
      createTest('should not start tracking and log an error when SDK is initialized in an unsupported environment')
        .withExtension(createExtension(path.join(BASE_PATH, name)).withRum().withLogs())
        .run(async ({ withBrowserLogs, flushEvents, intakeRegistry }) => {
          await flushEvents()

          expect(intakeRegistry.rumViewEvents).toHaveLength(0)

          withBrowserLogs((logs) => {
            const filteredLogs = logs.filter(isNotSdkLoadedMoreThanOnce)

            // Two errors, one for RUM and one for LOGS SDK
            expect(filteredLogs).toHaveLength(2)
            filteredLogs.forEach((log) => {
              expect(log).toMatchObject({
                level: 'error',
                message: ERROR_DOES_NOT_HAVE_ALLOWED_TRACKING_ORIGIN,
              })
            })
          })
        })

      createTest('should start tracking when allowedTrackingOrigins matches current domain')
        .withExtension(
          createExtension(path.join(BASE_PATH, name))
            .withRum({ allowedTrackingOrigins: ['LOCATION_ORIGIN'] })
            .withLogs({ allowedTrackingOrigins: ['LOCATION_ORIGIN'] })
        )
        .run(async ({ withBrowserLogs, flushEvents, intakeRegistry }) => {
          await flushEvents()

          expect(intakeRegistry.rumViewEvents).toHaveLength(1)

          withBrowserLogs((logs) =>
            expect(logs).not.toContainEqual(
              expect.objectContaining({
                level: 'error',
                message: ERROR_DOES_NOT_HAVE_ALLOWED_TRACKING_ORIGIN,
              })
            )
          )
        })

      createTest('should not start tracking when allowedTrackingOrigins does not match current domain')
        .withExtension(
          createExtension(path.join(BASE_PATH, name))
            .withRum({ allowedTrackingOrigins: ['https://app.example.com'] })
            .withLogs({ allowedTrackingOrigins: ['https://app.example.com'] })
        )
        .run(async ({ withBrowserLogs, flushEvents, intakeRegistry }) => {
          await flushEvents()

          expect(intakeRegistry.rumViewEvents).toHaveLength(0)

          withBrowserLogs((logs) => {
            const filteredLogs = logs.filter(isNotSdkLoadedMoreThanOnce)
            // Two errors, one for RUM and one for LOGS SDK
            expect(filteredLogs).toHaveLength(2)
            filteredLogs.forEach((log) => {
              expect(log).toMatchObject({
                level: 'error',
                message: ERROR_MESSAGE,
              })
            })
          })
        })
    })
  }

  /**
   * This test is reconstruction of an edge case that happens when using some extension that override `appendChild` and
   * the sync installation method using NextJs `<Script>` component.
   */
  createTest('should not warn - edge case simulating NextJs with an extension that override `appendChild`')
    .withExtension(createExtension(path.join(BASE_PATH, 'appendChild-extension')))
    .withRum()
    .withLogs()
    .withSetup((options, servers) => {
      const { rumScriptUrl, logsScriptUrl } = createCrossOriginScriptUrls(servers, options)
      return `
          <script src="${rumScriptUrl}"></script>
          <script src="${logsScriptUrl}"></script>
          <script>
            const script = document.createElement('script')
            script.innerHTML = 'window.DD_RUM.init(${formatConfiguration(options.rum!, servers)}); window.DD_LOGS.init(${formatConfiguration(options.logs!, servers)})'
            document.head.appendChild(script)
          </script>
        `
    })
    .run(async ({ withBrowserLogs, flushEvents, intakeRegistry }) => {
      await flushEvents()

      expect(intakeRegistry.rumViewEvents).toHaveLength(1)

      withBrowserLogs((logs) => expect(logs.length).toBe(0))
    })
})
