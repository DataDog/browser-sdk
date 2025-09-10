import path from 'path'
import { test, expect } from '@playwright/test'
import { createTest, createExtension, createCrossOriginScriptUrls, formatConfiguration } from '../../lib/framework'

const WARNING_MESSAGE =
  'Datadog Browser SDK: Running the Browser SDK in a Web extension content script is discouraged and will be forbidden in a future major release unless the `allowedTrackingOrigins` option is provided.'
const ERROR_MESSAGE = 'Datadog Browser SDK: SDK initialized on a non-allowed domain.'

const BASE_PATH = path.join(process.cwd(), 'test/apps')
const EXTENSIONS = ['base-extension', 'cdn-extension']

test.describe('browser extensions', () => {
  for (const name of EXTENSIONS) {
    test.describe(`with ${name} extension`, () => {
      createTest('should warn and start tracking when SDK is initialized in an unsupported environment')
        .withExtension(createExtension(path.join(BASE_PATH, name)).withRum())
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
        .withExtension(
          createExtension(path.join(BASE_PATH, name)).withRum({ allowedTrackingOrigins: ['LOCATION_ORIGIN'] })
        )
        .run(async ({ withBrowserLogs, flushEvents, intakeRegistry }) => {
          await flushEvents()

          expect(intakeRegistry.rumViewEvents).toHaveLength(1)

          withBrowserLogs((logs) => expect(logs.length).toBe(0))
        })

      createTest('should not start tracking when allowedTrackingOrigins does not match current domain')
        .withExtension(
          createExtension(path.join(BASE_PATH, name)).withRum({ allowedTrackingOrigins: ['https://app.example.com'] })
        )
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

  /**
   * This test is reconstruction of an edge case that happens when using some extension that override `appendChild` and
   * the sync installation method using NextJs `<Script>` component.
   */
  createTest('should not warn - edge case simulating NextJs with an extension that override `appendChild`')
    .withExtension(createExtension(path.join(BASE_PATH, 'appendChild-extension')))
    .withRum()
    .withSetup((options, servers) => {
      const { rumScriptUrl } = createCrossOriginScriptUrls(servers, options)
      return `
          <script src="${rumScriptUrl}"></script>
          <script>
            const script = document.createElement('script')
            script.innerHTML = 'window.DD_RUM.init(${formatConfiguration(options.rum!, servers)})'
            document.head.appendChild(script)
          </script>
        `
    })
    .run(async ({ withBrowserLogs, flushEvents, intakeRegistry }) => {
      test.fail() // TODO: remove this once the issue is fixed

      await flushEvents()

      expect(intakeRegistry.rumViewEvents).toHaveLength(1)

      withBrowserLogs((logs) => expect(logs.length).toBe(0))
    })
})
