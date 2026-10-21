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

// Debug IDs are derived from each chunk's content hash, so they're stable across rebuilds
// (regenerate these constants if app source/deps change). The shared `lib` remote is its own chunk,
// so its debug ID is the same for every app.
const APP1_EXPOSE_CHUNK = '__federation_expose_app1-d74be1a93aee64b4d047-app1.js'
const APP1_DEBUG_ID = '4b3d6a63-fb93-4cad-b3ee-f178b7020ba3'
const APP2_EXPOSE_CHUNK = '__federation_expose_app2-de619ccf294b7d2c971a-app2.js'
const APP2_DEBUG_ID = '5f3dc267-79ac-4d44-99b9-251f9931b053'
const LIB_EXPOSE_CHUNK = '__federation_expose_lib-c0a8a100340f04ff2712-lib.js'
const LIB_DEBUG_ID = '4564c6ea-a5bb-4355-968a-7de8d685fe65'

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

    test.describe('with element context', () => {
      createTest('automatic clicks should inherit microfrontend attribution from element properties')
        .withRum({ ...RUM_CONFIG, trackUserInteractions: true })
        .withRumSlim()
        .withSetup(microfrontendSetup)
        .withBody('<button id="shell-fetch" onclick="fetch(\'/ok\')">Shell fetch</button>')
        .run(async ({ intakeRegistry, flushEvents, page }) => {
          await expect(page.locator('#app1-fetch')).toBeVisible()
          await expect(page.locator('#app2-fetch')).toBeVisible()
          await page.evaluate(() => {
            Object.assign(document.getElementById('app1')!, {
              dd_service: 'mfe-app1-service',
              dd_version: '1.0.0',
              dd_context: { microfrontend: 'app1' },
            })
            Object.assign(document.getElementById('app2')!, {
              dd_service: 'mfe-app2-service',
              dd_version: '0.2.0',
              dd_context: { microfrontend: 'app2' },
            })
          })

          await page.click('#app1-fetch')
          await page.click('#app2-fetch')
          await page.click('#shell-fetch')
          await flushEvents()

          const clicks = intakeRegistry.rumActionEvents.filter((event) => event.action.type === 'click')
          expect(clicks).toHaveLength(3)
          expect(clicks).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                service: 'mfe-app1-service',
                version: '1.0.0',
                action: expect.objectContaining({ target: { name: 'app1-fetch' } }),
                context: expect.objectContaining({ microfrontend: 'app1' }),
              }),
              expect.objectContaining({
                service: 'mfe-app2-service',
                version: '0.2.0',
                action: expect.objectContaining({ target: { name: 'app2-fetch' } }),
                context: expect.objectContaining({ microfrontend: 'app2' }),
              }),
              expect.objectContaining({
                service: 'main-service',
                version: '1.0.0',
                action: expect.objectContaining({ target: { name: 'Shell fetch' } }),
              }),
            ])
          )
          expect(
            clicks.find((event) => event.action.target?.name === 'Shell fetch')!.context?.microfrontend
          ).toBeUndefined()
        })

      createTest('automatic clicks should inherit microfrontend attribution from element attribute')
        .withRum({ ...RUM_CONFIG, trackUserInteractions: true })
        .withRumSlim()
        .withSetup(microfrontendSetup)
        .withBody('<button id="shell-fetch" onclick="fetch(\'/ok\')">Shell fetch</button>')
        .run(async ({ intakeRegistry, flushEvents, page }) => {
          await expect(page.locator('#app1-fetch')).toBeVisible()
          await expect(page.locator('#app2-fetch')).toBeVisible()
          await page.evaluate(() => {
            document.getElementById('app1')!.setAttribute(
              'data-dd-context',
              JSON.stringify({
                service: 'mfe-app1-service',
                version: '1.0.0',
                context: { microfrontend: 'app1' },
              })
            )
            document.getElementById('app2')!.setAttribute(
              'data-dd-context',
              JSON.stringify({
                service: 'mfe-app2-service',
                version: '0.2.0',
                context: { microfrontend: 'app2' },
              })
            )
          })

          await page.click('#app1-fetch')
          await page.click('#app2-fetch')
          await page.click('#shell-fetch')
          await flushEvents()

          const clicks = intakeRegistry.rumActionEvents.filter((event) => event.action.type === 'click')
          expect(clicks).toHaveLength(3)
          expect(clicks).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                service: 'mfe-app1-service',
                version: '1.0.0',
                action: expect.objectContaining({ target: { name: 'app1-fetch' } }),
                context: expect.objectContaining({ microfrontend: 'app1' }),
              }),
              expect.objectContaining({
                service: 'mfe-app2-service',
                version: '0.2.0',
                action: expect.objectContaining({ target: { name: 'app2-fetch' } }),
                context: expect.objectContaining({ microfrontend: 'app2' }),
              }),
              expect.objectContaining({
                service: 'main-service',
                version: '1.0.0',
                action: expect.objectContaining({ target: { name: 'Shell fetch' } }),
              }),
            ])
          )
          expect(
            clicks.find((event) => event.action.target?.name === 'Shell fetch')!.context?.microfrontend
          ).toBeUndefined()
        })

      createTest('automatic clicks should inherit microfrontend attribution from element api')
        .withRum({ ...RUM_CONFIG, trackUserInteractions: true })
        .withRumSlim()
        .withSetup(microfrontendSetup)
        .withBody('<button id="shell-fetch" onclick="fetch(\'/ok\')">Shell fetch</button>')
        .run(async ({ intakeRegistry, flushEvents, page }) => {
          await expect(page.locator('#app1-fetch')).toBeVisible()
          await expect(page.locator('#app2-fetch')).toBeVisible()
          await page.evaluate(() => {
            window.DD_RUM!.setElementContext(document.getElementById('app1')!, {
              service: 'mfe-app1-service',
              version: '1.0.0',
              context: { microfrontend: 'app1' },
            })
            window.DD_RUM!.setElementContext(document.getElementById('app2')!, {
              service: 'mfe-app2-service',
              version: '0.2.0',
              context: { microfrontend: 'app2' },
            })
          })

          await page.click('#app1-fetch')
          await page.click('#app2-fetch')
          await page.click('#shell-fetch')
          await flushEvents()

          const clicks = intakeRegistry.rumActionEvents.filter((event) => event.action.type === 'click')
          expect(clicks).toHaveLength(3)
          expect(clicks).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                service: 'mfe-app1-service',
                version: '1.0.0',
                action: expect.objectContaining({ target: { name: 'app1-fetch' } }),
                context: expect.objectContaining({ microfrontend: 'app1' }),
              }),
              expect.objectContaining({
                service: 'mfe-app2-service',
                version: '0.2.0',
                action: expect.objectContaining({ target: { name: 'app2-fetch' } }),
                context: expect.objectContaining({ microfrontend: 'app2' }),
              }),
              expect.objectContaining({
                service: 'main-service',
                version: '1.0.0',
                action: expect.objectContaining({ target: { name: 'Shell fetch' } }),
              }),
            ])
          )
          expect(
            clicks.find((event) => event.action.target?.name === 'Shell fetch')!.context?.microfrontend
          ).toBeUndefined()
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
    createTest('runtime errors should have debug_id from source code context')
      .withRum(RUM_CONFIG)
      .withSetup(microfrontendSetup)
      .run(async ({ intakeRegistry, flushEvents, page, withBrowserLogs, baseUrl }) => {
        await page.click('#app1-runtime-error')
        await page.click('#app2-runtime-error')
        await flushEvents()

        expect(intakeRegistry.rumErrorEvents).toHaveLength(2)

        // Stacks are browser-dependent and Firefox reports more frames/chunks, adding more debug_ids entries.
        // We assert the chunk with toMatchObject instead of toEqual to allow those extras.

        // frame 0 -> app1 expose chunk (app1.ts + common.ts).
        expect(intakeRegistry.rumErrorEvents[0]._dd?.debug_ids).toEqual(
          expect.arrayContaining([{ url: `${baseUrl}microfrontend/chunks/${APP1_EXPOSE_CHUNK}`, id: APP1_DEBUG_ID }])
        )
        // frame 0 -> app2 expose chunk (app2.ts + common.ts)
        expect(intakeRegistry.rumErrorEvents[1]._dd?.debug_ids).toEqual(
          expect.arrayContaining([{ url: `${baseUrl}microfrontend/chunks/${APP2_EXPOSE_CHUNK}`, id: APP2_DEBUG_ID }])
        )

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

        // Stacks are browser-dependent and Firefox reports more frames/chunks, adding more debug_ids entries.
        // We assert the chunk with toMatchObject instead of toEqual to allow those extras.

        // script 0 -> app1 expose chunk (app1.ts + common.ts)
        expect(longTaskEvents[0]._dd?.debug_ids).toEqual(
          expect.arrayContaining([{ url: `${baseUrl}microfrontend/chunks/${APP1_EXPOSE_CHUNK}`, id: APP1_DEBUG_ID }])
        )
        // script 0 -> app2 expose chunk (app2.ts + common.ts)
        expect(longTaskEvents[1]._dd?.debug_ids).toEqual(
          expect.arrayContaining([{ url: `${baseUrl}microfrontend/chunks/${APP2_EXPOSE_CHUNK}`, id: APP2_DEBUG_ID }])
        )
      })

    createTest('errors spanning multiple chunks should have a debug_id for each chunk in the stack')
      .withRum(RUM_CONFIG)
      .withSetup(microfrontendSetup)
      .run(async ({ intakeRegistry, flushEvents, page, withBrowserLogs, baseUrl }) => {
        await page.click('#app1-nested-error')
        await page.click('#app2-nested-error')
        await flushEvents()

        expect(intakeRegistry.rumErrorEvents).toHaveLength(2)

        // Stacks are browser-dependent and Firefox reports more frames/chunks, adding more debug_ids entries.
        // We assert the chunk with toMatchObject instead of toEqual to allow those extras.

        // frame 0 (throw) -> shared lib chunk (boom), frame 1 (caller) -> app1 expose chunk
        expect(intakeRegistry.rumErrorEvents[0]._dd?.debug_ids).toEqual(
          expect.arrayContaining([
            { url: `${baseUrl}microfrontend/chunks/${LIB_EXPOSE_CHUNK}`, id: LIB_DEBUG_ID },
            { url: `${baseUrl}microfrontend/chunks/${APP1_EXPOSE_CHUNK}`, id: APP1_DEBUG_ID },
          ])
        )
        // same shared lib debug ID, merged with app2's own chunk
        expect(intakeRegistry.rumErrorEvents[1]._dd?.debug_ids).toEqual(
          expect.arrayContaining([
            { url: `${baseUrl}microfrontend/chunks/${LIB_EXPOSE_CHUNK}`, id: LIB_DEBUG_ID },
            { url: `${baseUrl}microfrontend/chunks/${APP2_EXPOSE_CHUNK}`, id: APP2_DEBUG_ID },
          ])
        )

        withBrowserLogs((browserLogs) => {
          expect(browserLogs).toHaveLength(2)
        })
      })
  })

  test.describe('Logs debug_id attribution', () => {
    createTest('runtime errors should have debug_id from source code context')
      .withLogs()
      .withSetup(microfrontendSetup)
      .run(async ({ intakeRegistry, flushEvents, page, withBrowserLogs, baseUrl }) => {
        await page.click('#app1-runtime-error')
        await page.click('#app2-runtime-error')
        await flushEvents()

        expect(intakeRegistry.logsEvents).toHaveLength(2)

        // Stacks are browser-dependent and Firefox reports more frames/chunks, adding more debug_ids entries.
        // We assert the chunk with arrayContaining instead of toEqual to allow those extras.

        // frame 0 -> app1 expose chunk (app1.ts + common.ts).
        expect(intakeRegistry.logsEvents[0]._dd?.debug_ids).toEqual(
          expect.arrayContaining([{ url: `${baseUrl}microfrontend/chunks/${APP1_EXPOSE_CHUNK}`, id: APP1_DEBUG_ID }])
        )
        // frame 0 -> app2 expose chunk (app2.ts + common.ts)
        expect(intakeRegistry.logsEvents[1]._dd?.debug_ids).toEqual(
          expect.arrayContaining([{ url: `${baseUrl}microfrontend/chunks/${APP2_EXPOSE_CHUNK}`, id: APP2_DEBUG_ID }])
        )

        withBrowserLogs((browserLogs) => {
          expect(browserLogs).toHaveLength(2)
        })
      })

    createTest('errors spanning multiple chunks should have a debug_id for each chunk in the stack')
      .withLogs()
      .withSetup(microfrontendSetup)
      .run(async ({ intakeRegistry, flushEvents, page, withBrowserLogs, baseUrl }) => {
        await page.click('#app1-nested-error')
        await page.click('#app2-nested-error')
        await flushEvents()

        expect(intakeRegistry.logsEvents).toHaveLength(2)

        // Stacks are browser-dependent and Firefox reports more frames/chunks, adding more debug_ids entries.
        // We assert the chunk with arrayContaining instead of toEqual to allow those extras.

        // frame 0 (throw) -> shared lib chunk (boom), frame 1 (caller) -> app1 expose chunk
        expect(intakeRegistry.logsEvents[0]._dd?.debug_ids).toEqual(
          expect.arrayContaining([
            { url: `${baseUrl}microfrontend/chunks/${LIB_EXPOSE_CHUNK}`, id: LIB_DEBUG_ID },
            { url: `${baseUrl}microfrontend/chunks/${APP1_EXPOSE_CHUNK}`, id: APP1_DEBUG_ID },
          ])
        )
        // same shared lib debug ID, merged with app2's own chunk
        expect(intakeRegistry.logsEvents[1]._dd?.debug_ids).toEqual(
          expect.arrayContaining([
            { url: `${baseUrl}microfrontend/chunks/${LIB_EXPOSE_CHUNK}`, id: LIB_DEBUG_ID },
            { url: `${baseUrl}microfrontend/chunks/${APP2_EXPOSE_CHUNK}`, id: APP2_DEBUG_ID },
          ])
        )

        withBrowserLogs((browserLogs) => {
          expect(browserLogs).toHaveLength(2)
        })
      })
  })

  test.describe('RUM profiling debug_id attribution', () => {
    test.beforeEach(({ browserName }) => {
      test.skip(browserName !== 'chromium', 'JS Profiling API is only available in Chromium')
    })

    createTest('profiling should have debug_id from source code context')
      .withRum({ ...RUM_CONFIG, profilingSampleRate: 100 })
      .withBasePath('/?js-profiling=true')
      .withSetup(microfrontendSetup)
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        await page.click('#app1-loaf')
        await page.click('#app2-loaf')
        await flushEvents()

        expect(intakeRegistry.profileRequests).toHaveLength(1)

        const trace = intakeRegistry.profileRequests[0].trace
        // Microfrontend chunks are served from a cross-origin host, so their resource URL
        // doesn't share `baseUrl`'s origin - match by chunk filename instead.
        const app1ResourceId = trace.resources.findIndex((url: string) => url.endsWith(APP1_EXPOSE_CHUNK))
        const app2ResourceId = trace.resources.findIndex((url: string) => url.endsWith(APP2_EXPOSE_CHUNK))

        expect(app1ResourceId).toBeGreaterThan(-1)
        expect(app2ResourceId).toBeGreaterThan(-1)

        expect(trace.debugIds).toEqual(
          expect.arrayContaining([
            { resourceId: app1ResourceId, debugId: APP1_DEBUG_ID },
            { resourceId: app2ResourceId, debugId: APP2_DEBUG_ID },
          ])
        )
      })
  })

  test.describe('Logs service and version attribution', () => {
    test.describe('with source code bundler plugin', () => {
      // Chromium reports each deprecation only once per page, so test each bundle separately.
      ;[
        { app: 'app1', version: '1.0.0', chunk: APP1_EXPOSE_CHUNK },
        { app: 'app2', version: '0.2.0', chunk: APP2_EXPOSE_CHUNK },
      ].forEach(({ app, version, chunk }) => {
        createTest(`deprecation reports from ${app} should have service and version from source code context`)
          .withHead('<script>window.nativeXhrOpen = XMLHttpRequest.prototype.open</script>')
          .withLogs({
            ...LOGS_CONFIG,
            service: 'shell-service',
            version: 'shell-version',
            forwardReports: ['deprecation'],
          })
          .withSetup(microfrontendSetup)
          .run(async ({ intakeRegistry, flushEvents, page, browserName }) => {
            test.skip(browserName !== 'chromium', 'Deprecation reports require Chromium ReportingObserver')

            await page.click(`#${app}-deprecation`)
            await flushEvents()

            expect(intakeRegistry.logsEvents).toMatchObject([
              {
                origin: 'report',
                status: 'warn',
                message: expect.stringContaining('deprecation: Synchronous'),
                service: `mfe-${app}-service`,
                version,
                ddtags: expect.stringContaining(`service:mfe-${app}-service,version:${version}`),
              },
            ])
            const log = intakeRegistry.logsEvents[0]
            expect(log.message).toContain(chunk)
            expect(log.error).toBeUndefined()
            expect(log.ddtags).not.toContain('service:shell-service')
            expect(log.ddtags).not.toContain('version:shell-version')
          })
      })

      createTest('CSP violation reports should have service and version from source code context')
        .withLogs({
          ...LOGS_CONFIG,
          service: 'shell-service',
          version: 'shell-version',
          forwardReports: ['csp_violation'],
        })
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page, browserName, withBrowserLogs }) => {
          await page.click('#app1-csp-violation')
          await page.click('#app2-csp-violation')
          await flushEvents()

          expect(intakeRegistry.logsEvents).toMatchObject([
            {
              origin: 'report',
              service: 'mfe-app1-service',
              version: '1.0.0',
              ddtags: expect.stringContaining('service:mfe-app1-service,version:1.0.0'),
              error: { stack: expect.stringContaining(APP1_EXPOSE_CHUNK) },
            },
            {
              origin: 'report',
              service: 'mfe-app2-service',
              version: '0.2.0',
              ddtags: expect.stringContaining('service:mfe-app2-service,version:0.2.0'),
              error: { stack: expect.stringContaining(APP2_EXPOSE_CHUNK) },
            },
          ])

          for (const log of intakeRegistry.logsEvents) {
            expect(log.message).toMatch(
              /^csp_violation: 'https:\/\/example\.com\/foo\.js' blocked by 'script-src(-elem)?' directive$/
            )
            expect(log.ddtags).not.toContain('version:shell-version')
            expect(log.ddtags).not.toContain('service:shell-service')
          }

          withBrowserLogs((browserLogs) => {
            // Firefox also warns that each blocked script failed to load.
            expect(browserLogs).toHaveLength(browserName === 'firefox' ? 4 : 2)
          })
        })

      createTest('errors from console.error should have service and version from source code context')
        .withLogs({ ...LOGS_CONFIG, service: 'shell-service', version: 'shell-version' })
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page, withBrowserLogs }) => {
          await page.click('#app1-console-error')
          await page.click('#app2-console-error')
          await flushEvents()

          expect(intakeRegistry.logsEvents).toMatchObject([
            {
              message: 'app1-console-error',
              service: 'mfe-app1-service',
              version: '1.0.0',
              ddtags: expect.stringContaining('service:mfe-app1-service,version:1.0.0'),
            },
            {
              message: 'app2-console-error',
              service: 'mfe-app2-service',
              version: '0.2.0',
              ddtags: expect.stringContaining('service:mfe-app2-service,version:0.2.0'),
            },
          ])

          for (const log of intakeRegistry.logsEvents) {
            expect(log.ddtags).not.toContain('version:shell-version')
            expect(log.ddtags).not.toContain('service:shell-service')
          }

          withBrowserLogs((browserLogs) => {
            expect(browserLogs).toHaveLength(2)
          })
        })

      createTest('runtime errors should have service and version from source code context')
        .withLogs({ ...LOGS_CONFIG, service: 'shell-service', version: 'shell-version' })
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page, withBrowserLogs }) => {
          await page.click('#app1-runtime-error')
          await page.click('#app2-runtime-error')
          await flushEvents()

          expect(intakeRegistry.logsEvents).toMatchObject([
            {
              service: 'mfe-app1-service',
              version: '1.0.0',
              ddtags: expect.stringContaining('service:mfe-app1-service,version:1.0.0'),
            },
            {
              service: 'mfe-app2-service',
              version: '0.2.0',
              ddtags: expect.stringContaining('service:mfe-app2-service,version:0.2.0'),
            },
          ])

          for (const log of intakeRegistry.logsEvents) {
            expect(log.ddtags).not.toContain('version:shell-version')
            expect(log.ddtags).not.toContain('service:shell-service')
          }

          withBrowserLogs((browserLogs) => {
            expect(browserLogs).toHaveLength(2)
          })
        })
    })

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
