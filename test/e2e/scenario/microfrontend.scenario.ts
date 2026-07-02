import type { RumEvent, RumEventDomainContext, RumInitConfiguration } from '@datadog/browser-rum-core'
import type { LogsEvent, LogsInitConfiguration, LogsEventDomainContext } from '@datadog/browser-logs'
import { test, expect } from '@playwright/test'
import { createTest, microfrontendSetup } from '../lib/framework'
import { isLongAnimationFrameSupported } from '../lib/helpers/browser'

const HANDLING_STACK_REGEX = /^HandlingStack: .*\n\s+at testHandlingStack @/

const RUM_CONFIG: Partial<RumInitConfiguration> = {
  service: 'main-service',
  version: '1.0.0',
  beforeSend: (event: RumEvent, domainContext: RumEventDomainContext) => {
    if ('handlingStack' in domainContext) {
      event.context!.handlingStack = domainContext.handlingStack
    }

    return true
  },
}

const LOGS_CONFIG: Partial<LogsInitConfiguration> = {
  forwardConsoleLogs: 'all',
  beforeSend: (event: LogsEvent, domainContext: LogsEventDomainContext) => {
    if (domainContext && 'handlingStack' in domainContext) {
      event.context = { handlingStack: domainContext.handlingStack }
    }

    return true
  },
}

test.describe('microfrontend', () => {
  test.describe('RUM service and version attribution', () => {
    test.describe('with beforeSend', () => {
      createTest('expose handling stack for fetch requests')
        .withRum(RUM_CONFIG)
        .withRumInit((configuration) => {
          window.DD_RUM!.init(configuration)

          // eslint-disable-next-line @typescript-eslint/no-empty-function
          const noop = () => {}
          function testHandlingStack() {
            fetch('/ok').then(noop, noop)
          }

          testHandlingStack()
        })
        .run(async ({ intakeRegistry, flushEvents }) => {
          await flushEvents()

          const event = intakeRegistry.rumResourceEvents.find((event) => event.resource.type === 'fetch')

          expect(event).toBeTruthy()
          expect(event?.context?.handlingStack).toMatch(HANDLING_STACK_REGEX)
        })

      createTest('expose handling stack for xhr requests')
        .withRum(RUM_CONFIG)
        .withRumInit((configuration) => {
          window.DD_RUM!.init(configuration)

          function testHandlingStack() {
            const xhr = new XMLHttpRequest()
            xhr.open('GET', '/ok')
            xhr.send()
          }

          testHandlingStack()
        })
        .run(async ({ intakeRegistry, flushEvents }) => {
          await flushEvents()

          const event = intakeRegistry.rumResourceEvents.find((event) => event.resource.type === 'xhr')

          expect(event).toBeTruthy()
          expect(event?.context?.handlingStack).toMatch(HANDLING_STACK_REGEX)
        })

      createTest('expose handling stack for DD_RUM.addAction')
        .withRum(RUM_CONFIG)
        .withRumInit((configuration) => {
          window.DD_RUM!.init(configuration)

          function testHandlingStack() {
            window.DD_RUM!.addAction('foo')
          }

          testHandlingStack()
        })
        .run(async ({ intakeRegistry, flushEvents }) => {
          await flushEvents()

          const event = intakeRegistry.rumActionEvents[0]

          expect(event).toBeTruthy()
          expect(event?.context?.handlingStack).toMatch(HANDLING_STACK_REGEX)
        })

      createTest('expose handling stack for DD_RUM.addError')
        .withRum(RUM_CONFIG)
        .withRumInit((configuration) => {
          window.DD_RUM!.init(configuration)

          function testHandlingStack() {
            window.DD_RUM!.addError(new Error('foo'))
          }

          testHandlingStack()
        })
        .run(async ({ intakeRegistry, flushEvents }) => {
          await flushEvents()

          const event = intakeRegistry.rumErrorEvents[0]

          expect(event).toBeTruthy()
          expect(event?.context?.handlingStack).toMatch(HANDLING_STACK_REGEX)
        })

      createTest('expose handling stack for console errors')
        .withRum(RUM_CONFIG)
        .withRumInit((configuration) => {
          window.DD_RUM!.init(configuration)

          function testHandlingStack() {
            console.error('foo')
          }

          testHandlingStack()
        })
        .run(async ({ intakeRegistry, flushEvents, withBrowserLogs }) => {
          await flushEvents()

          const event = intakeRegistry.rumErrorEvents[0]

          withBrowserLogs((logs) => {
            expect(logs).toHaveLength(1)
            expect(logs[0].message).toMatch(/foo$/)
          })

          expect(event).toBeTruthy()
          expect(event?.context?.handlingStack).toMatch(HANDLING_STACK_REGEX)
        })

      createTest('expose handling stack for DD_RUM.startView')
        .withRum(RUM_CONFIG)
        .withRumInit((configuration) => {
          window.DD_RUM!.init(configuration)

          function testHandlingStack() {
            window.DD_RUM!.startView({ name: 'test-view' })
          }

          testHandlingStack()
        })
        .run(async ({ intakeRegistry, flushEvents }) => {
          await flushEvents()

          const event = intakeRegistry.rumViewEvents.find((event) => event.view.name === 'test-view')

          expect(event).toBeTruthy()
          expect(event?.context?.handlingStack).toMatch(HANDLING_STACK_REGEX)
        })

      createTest('expose handling stack for DD_RUM.startDurationVital')
        .withRum(RUM_CONFIG)
        .withRumInit((configuration) => {
          window.DD_RUM!.init(configuration)

          function testHandlingStack() {
            window.DD_RUM!.startDurationVital('test-vital')
            window.DD_RUM!.stopDurationVital('test-vital')
          }

          testHandlingStack()
        })
        .run(async ({ intakeRegistry, flushEvents }) => {
          await flushEvents()

          const event = intakeRegistry.rumVitalEvents.find((event) => event.vital.name === 'test-vital')

          expect(event).toBeTruthy()
          expect(event?.context?.handlingStack).toMatch(HANDLING_STACK_REGEX)
        })

      createTest('expose handling stack for DD_RUM.startOperation')
        .withRum({ ...RUM_CONFIG })
        .withRumInit((configuration) => {
          window.DD_RUM!.init(configuration)

          function testHandlingStack() {
            window.DD_RUM!.startOperation('test-operation')
          }

          testHandlingStack()
        })
        .run(async ({ intakeRegistry, flushEvents }) => {
          await flushEvents()

          const event = intakeRegistry.rumVitalEvents.find((event) => event.vital.name === 'test-operation')

          expect(event).toBeTruthy()
          expect(event?.context?.handlingStack).toMatch(HANDLING_STACK_REGEX)
        })

      createTest('resource: allow to modify service and version')
        .withRum(RUM_CONFIG)
        .withRumInit((configuration) => {
          window.DD_RUM!.init({
            ...configuration,
            beforeSend: (event: RumEvent) => {
              if (event.type === 'resource') {
                event.service = 'mfe-service'
                event.version = '0.1.0'
              }

              return true
            },
          })
        })
        .run(async ({ intakeRegistry, flushEvents }) => {
          await flushEvents()

          const viewEvent = intakeRegistry.rumViewEvents[0]
          const resourceEvent = intakeRegistry.rumResourceEvents[0]

          expect(viewEvent).toBeTruthy()
          expect(viewEvent.service).toBe('main-service')
          expect(viewEvent.version).toBe('1.0.0')

          expect(resourceEvent).toBeTruthy()
          expect(resourceEvent.service).toBe('mfe-service')
          expect(resourceEvent.version).toBe('0.1.0')
        })

      createTest('view: allowed to modify service and version')
        .withRum(RUM_CONFIG)
        .withRumInit((configuration) => {
          window.DD_RUM!.init({
            ...configuration,
            beforeSend: (event: RumEvent) => {
              if (event.type === 'view') {
                event.service = 'mfe-service'
                event.version = '0.1.0'
              }

              return true
            },
          })
        })
        .run(async ({ intakeRegistry, flushEvents }) => {
          await flushEvents()

          const viewEvent = intakeRegistry.rumViewEvents[0]

          expect(viewEvent).toBeTruthy()
          expect(viewEvent.service).toBe('mfe-service')
          expect(viewEvent.version).toBe('0.1.0')
        })
    })

    test.describe('with source code bundler plugin', () => {
      createTest('errors from console.error should have service and version from source code context')
        .withRum(RUM_CONFIG)
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page, withBrowserLogs }) => {
          await page.click('#app1-console-error')
          await page.click('#app2-console-error')
          await flushEvents()

          expect(intakeRegistry.rumErrorEvents).toMatchObject([
            expect.objectContaining({ service: 'mfe-app1-service', version: '1.0.0' }),
            expect.objectContaining({ service: 'mfe-app2-service', version: '0.2.0' }),
          ])

          withBrowserLogs((browserLogs) => {
            expect(browserLogs).toHaveLength(2)
          })
        })

      createTest('runtime errors should have service and version from source code context')
        .withRum(RUM_CONFIG)
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page, withBrowserLogs }) => {
          await page.click('#app1-runtime-error')
          await page.click('#app2-runtime-error')
          await flushEvents()

          expect(intakeRegistry.rumErrorEvents).toMatchObject([
            expect.objectContaining({ service: 'mfe-app1-service', version: '1.0.0' }),
            expect.objectContaining({ service: 'mfe-app2-service', version: '0.2.0' }),
          ])

          withBrowserLogs((browserLogs) => {
            expect(browserLogs).toHaveLength(2)
          })
        })

      createTest('fetch requests should have service and version from source code context')
        .withRum(RUM_CONFIG)
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page }) => {
          await page.click('#app1-fetch')
          await page.click('#app2-fetch')
          await flushEvents()

          const resourceEvents = intakeRegistry.rumResourceEvents.filter((event) => event.resource.type === 'fetch')

          expect(resourceEvents).toMatchObject([
            expect.objectContaining({ service: 'mfe-app1-service', version: '1.0.0' }),
            expect.objectContaining({ service: 'mfe-app2-service', version: '0.2.0' }),
          ])
        })

      createTest('xhr requests should have service and version from source code context')
        .withRum(RUM_CONFIG)
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page }) => {
          await page.click('#app1-xhr')
          await page.click('#app2-xhr')
          await flushEvents()

          const resourceEvents = intakeRegistry.rumResourceEvents.filter((event) => event.resource.type === 'xhr')

          expect(resourceEvents).toMatchObject([
            expect.objectContaining({ service: 'mfe-app1-service', version: '1.0.0' }),
            expect.objectContaining({ service: 'mfe-app2-service', version: '0.2.0' }),
          ])
        })

      createTest('custom actions should have service and version from source code context')
        .withRum(RUM_CONFIG)
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page }) => {
          await page.click('#app1-custom-action')
          await page.click('#app2-custom-action')
          await flushEvents()

          const rumActionEvents = intakeRegistry.rumActionEvents.filter((event) => event.action.type === 'custom')

          expect(rumActionEvents).toMatchObject([
            expect.objectContaining({
              service: 'mfe-app1-service',
              version: '1.0.0',
            }),
            expect.objectContaining({
              service: 'mfe-app2-service',
              version: '0.2.0',
            }),
          ])
        })

      createTest('LOAf should have service and version from source code context')
        .withRum(RUM_CONFIG)
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page }) => {
          test.skip(
            !(await isLongAnimationFrameSupported(page)),
            'Browser does not support PerformanceLongAnimationFrameTiming'
          )

          await page.click('#app1-loaf')
          await page.click('#app2-loaf')
          await flushEvents()

          const longTaskEvents = intakeRegistry.rumLongTaskEvents.filter((event) =>
            event.long_task.scripts?.[0]?.invoker?.includes('onclick')
          )

          expect(longTaskEvents).toMatchObject([
            expect.objectContaining({ service: 'mfe-app1-service', version: '1.0.0' }),
            expect.objectContaining({ service: 'mfe-app2-service', version: '0.2.0' }),
          ])
        })

      createTest('manual views should have service and version from source code context')
        .withRum(RUM_CONFIG)
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page }) => {
          await page.click('#app1-view')
          await page.click('#app2-view')
          await flushEvents()

          expect(intakeRegistry.rumViewEvents).toMatchObject(
            expect.arrayContaining([
              expect.objectContaining({
                view: expect.objectContaining({ name: 'app1-view' }),
                service: 'mfe-app1-service',
                version: '1.0.0',
              }),
              expect.objectContaining({
                view: expect.objectContaining({ name: 'app2-view' }),
                service: 'mfe-app2-service',
                version: '0.2.0',
              }),
            ])
          )
        })

      createTest('duration vitals should have service and version from source code context')
        .withRum(RUM_CONFIG)
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page }) => {
          await page.click('#app1-vital')
          await page.click('#app2-vital')
          await flushEvents()

          expect(intakeRegistry.rumVitalEvents).toMatchObject([
            expect.objectContaining({ service: 'mfe-app1-service', version: '1.0.0' }),
            expect.objectContaining({ service: 'mfe-app2-service', version: '0.2.0' }),
          ])
        })

      createTest('operations should have service and version from source code context')
        .withRum({ ...RUM_CONFIG })
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page }) => {
          await page.click('#app1-feature-operation')
          await page.click('#app2-feature-operation')
          await flushEvents()

          const featureOperationEvents = intakeRegistry.rumVitalEvents.filter(
            (event) => event.vital.step_type === 'start'
          )

          expect(featureOperationEvents).toMatchObject([
            expect.objectContaining({ service: 'mfe-app1-service', version: '1.0.0' }),
            expect.objectContaining({ service: 'mfe-app2-service', version: '0.2.0' }),
          ])
        })
    })
  })

  test.describe('RUM debug_id attribution', () => {
    // Debug IDs are deterministic: the build plugin derives them from each emitted chunk's content
    // hash, so they are stable across clean rebuilds (only change if the app source/deps change — in
    // which case regenerate these constants). Most app code lives in each app's Module-Federation
    // expose chunk (app{1,2}.ts + common.ts); the shared `lib` remote is a separate chunk loaded once,
    // so its debug ID is identical for every app.
    const APP1_EXPOSE_CHUNK = '__federation_expose_app1-8adfc35e0ddfff22d7d0-app1.js'
    const APP1_DEBUG_ID = 'efcb171a-1822-45ad-81f1-a82adab920c7'
    const APP2_EXPOSE_CHUNK = '__federation_expose_app2-e9242831fd6d69399e3b-app2.js'
    const APP2_DEBUG_ID = 'ff6353d8-f8d4-4b83-a316-9307c565f8f7'
    const LIB_EXPOSE_CHUNK = '__federation_expose_lib-f7d73fec27c87d18a3e2-lib.js'
    const LIB_DEBUG_ID = '8d90326d-0657-4beb-8f71-439ed03ea3cd'

    createTest('runtime errors should have debug_id from source code context')
      .withRum(RUM_CONFIG)
      .withSetup(microfrontendSetup)
      .run(async ({ intakeRegistry, flushEvents, page, withBrowserLogs, baseUrl }) => {
        await page.click('#app1-runtime-error')
        await page.click('#app2-runtime-error')
        await flushEvents()

        expect(intakeRegistry.rumErrorEvents).toHaveLength(2)
        // frame 0 -> app1 expose chunk (app1.ts + common.ts)
        expect(intakeRegistry.rumErrorEvents[0]._dd?.debug_ids).toEqual({
          [`${baseUrl}microfrontend/chunks/${APP1_EXPOSE_CHUNK}`]: APP1_DEBUG_ID,
        })
        // frame 0 -> app2 expose chunk (app2.ts + common.ts)
        expect(intakeRegistry.rumErrorEvents[1]._dd?.debug_ids).toEqual({
          [`${baseUrl}microfrontend/chunks/${APP2_EXPOSE_CHUNK}`]: APP2_DEBUG_ID,
        })

        withBrowserLogs((browserLogs) => {
          expect(browserLogs).toHaveLength(2)
        })
      })

    createTest('LOAf should have debug_id from source code context')
      .withRum(RUM_CONFIG)
      .withSetup(microfrontendSetup)
      .run(async ({ intakeRegistry, flushEvents, page, baseUrl }) => {
        test.skip(
          !(await isLongAnimationFrameSupported(page)),
          'Browser does not support PerformanceLongAnimationFrameTiming'
        )

        await page.click('#app1-loaf')
        await page.click('#app2-loaf')
        await flushEvents()

        const longTaskEvents = intakeRegistry.rumLongTaskEvents.filter((event) =>
          event.long_task.scripts?.[0]?.invoker?.includes('onclick')
        )

        expect(longTaskEvents).toHaveLength(2)
        // script 0 -> app1 expose chunk (app1.ts + common.ts)
        expect(longTaskEvents[0]._dd?.debug_ids).toEqual({
          [`${baseUrl}microfrontend/chunks/${APP1_EXPOSE_CHUNK}`]: APP1_DEBUG_ID,
        })
        // script 0 -> app2 expose chunk (app2.ts + common.ts)
        expect(longTaskEvents[1]._dd?.debug_ids).toEqual({
          [`${baseUrl}microfrontend/chunks/${APP2_EXPOSE_CHUNK}`]: APP2_DEBUG_ID,
        })
      })

    createTest('errors spanning multiple chunks should have a debug_id for each chunk in the stack')
      .withRum(RUM_CONFIG)
      .withSetup(microfrontendSetup)
      .run(async ({ intakeRegistry, flushEvents, page, withBrowserLogs, baseUrl }) => {
        await page.click('#app1-nested-error')
        await page.click('#app2-nested-error')
        await flushEvents()

        expect(intakeRegistry.rumErrorEvents).toHaveLength(2)
        // frame 0 (throw) -> shared lib chunk (boom), frame 1 (caller) -> app1 expose chunk
        expect(intakeRegistry.rumErrorEvents[0]._dd?.debug_ids).toEqual({
          [`${baseUrl}microfrontend/chunks/${LIB_EXPOSE_CHUNK}`]: LIB_DEBUG_ID,
          [`${baseUrl}microfrontend/chunks/${APP1_EXPOSE_CHUNK}`]: APP1_DEBUG_ID,
        })
        // same shared lib debug ID, merged with app2's own chunk
        expect(intakeRegistry.rumErrorEvents[1]._dd?.debug_ids).toEqual({
          [`${baseUrl}microfrontend/chunks/${LIB_EXPOSE_CHUNK}`]: LIB_DEBUG_ID,
          [`${baseUrl}microfrontend/chunks/${APP2_EXPOSE_CHUNK}`]: APP2_DEBUG_ID,
        })

        withBrowserLogs((browserLogs) => {
          expect(browserLogs).toHaveLength(2)
        })
      })
  })

  test.describe('Logs service and version attribution', () => {
    createTest('expose handling stack for console.log')
      .withLogs(LOGS_CONFIG)
      .withLogsInit((configuration) => {
        window.DD_LOGS!.init(configuration)

        function testHandlingStack() {
          console.log('foo')
        }

        testHandlingStack()
      })
      .run(async ({ intakeRegistry, flushEvents, flushBrowserLogs }) => {
        await flushEvents()

        const event = intakeRegistry.logsEvents[0]

        flushBrowserLogs()

        expect(event).toBeTruthy()
        expect(event?.context).toEqual({
          handlingStack: expect.stringMatching(HANDLING_STACK_REGEX),
        })
      })

    createTest('expose handling stack for DD_LOGS.logger.log')
      .withLogs(LOGS_CONFIG)
      .withLogsInit((configuration) => {
        window.DD_LOGS!.init(configuration)

        function testHandlingStack() {
          window.DD_LOGS!.logger.log('foo')
        }

        testHandlingStack()
      })
      .run(async ({ intakeRegistry, flushEvents, flushBrowserLogs }) => {
        await flushEvents()

        const event = intakeRegistry.logsEvents[0]

        flushBrowserLogs()

        expect(event).toBeTruthy()
        expect(event?.context).toEqual({
          handlingStack: expect.stringMatching(HANDLING_STACK_REGEX),
        })
      })
  })
})
