import type { RumEvent, RumEventDomainContext, RumInitConfiguration } from '@datadog/browser-rum-core'
import type { LogsEvent, LogsInitConfiguration, LogsEventDomainContext } from '@datadog/browser-logs'
import { test, expect } from '@playwright/test'
import { ExperimentalFeature } from '@datadog/browser-core'
import { createTest, microfrontendSetup } from '../lib/framework'

const HANDLING_STACK_REGEX = /^HandlingStack: .*\n\s+at testHandlingStack @/

const RUM_CONFIG: Partial<RumInitConfiguration> = {
  service: 'main-service',
  version: '1.0.0',
  enableExperimentalFeatures: [ExperimentalFeature.SOURCE_CODE_CONTEXT],
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
  test.describe('RUM', () => {
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
            const ref = window.DD_RUM!.startDurationVital('test-vital')
            window.DD_RUM!.stopDurationVital(ref)
          }

          testHandlingStack()
        })
        .run(async ({ intakeRegistry, flushEvents }) => {
          await flushEvents()

          const event = intakeRegistry.rumVitalEvents.find((event) => event.vital.name === 'test-vital')

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
                event.service = 'mf-service'
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
          expect(resourceEvent.service).toBe('mf-service')
          expect(resourceEvent.version).toBe('0.1.0')
        })

      createTest('view: allowed to modify service and version')
        .withRum(RUM_CONFIG)
        .withRumInit((configuration) => {
          window.DD_RUM!.init({
            ...configuration,
            beforeSend: (event: RumEvent) => {
              if (event.type === 'view') {
                event.service = 'mf-service'
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
          expect(viewEvent.service).toBe('mf-service')
          expect(viewEvent.version).toBe('0.1.0')
        })
    })

    test.describe('with source code bundler plugin', () => {
      createTest('errors from DD_RUM.addError should have service and version from source code context')
        .withRum(RUM_CONFIG)
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page }) => {
          await page.click('#app1-error-button')
          await page.click('#app2-error-button')
          await flushEvents()

          expect(intakeRegistry.rumErrorEvents).toMatchObject([
            expect.objectContaining({ service: 'mf-app1-service', version: '1.0.0' }),
            expect.objectContaining({ service: 'mf-app2-service', version: '0.2.0' }),
          ])
        })

      createTest('errors from console.error should have service and version from source code context')
        .withRum(RUM_CONFIG)
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page, withBrowserLogs }) => {
          await page.click('#app1-console-error-button')
          await page.click('#app2-console-error-button')
          await flushEvents()

          expect(intakeRegistry.rumErrorEvents).toMatchObject([
            expect.objectContaining({ service: 'mf-app1-service', version: '1.0.0' }),
            expect.objectContaining({ service: 'mf-app2-service', version: '0.2.0' }),
          ])

          withBrowserLogs((browserLogs) => {
            expect(browserLogs).toHaveLength(2)
          })
        })

      createTest('runtime errors should have service and version from source code context')
        .withRum(RUM_CONFIG)
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page, withBrowserLogs }) => {
          await page.click('#app1-runtime-error-button')
          await page.click('#app2-runtime-error-button')
          await flushEvents()

          expect(intakeRegistry.rumErrorEvents).toMatchObject([
            expect.objectContaining({ service: 'mf-app1-service', version: '1.0.0' }),
            expect.objectContaining({ service: 'mf-app2-service', version: '0.2.0' }),
          ])

          withBrowserLogs((browserLogs) => {
            expect(browserLogs).toHaveLength(2)
          })
        })

      createTest('fetch requests should have service and version from source code context')
        .withRum(RUM_CONFIG)
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page }) => {
          await page.click('#app1-fetch-button')
          await page.click('#app2-fetch-button')
          await flushEvents()

          const resourceEvents = intakeRegistry.rumResourceEvents.filter((event) => event.resource.type === 'fetch')

          expect(resourceEvents).toMatchObject([
            expect.objectContaining({ service: 'mf-app1-service', version: '1.0.0' }),
            expect.objectContaining({ service: 'mf-app2-service', version: '0.2.0' }),
          ])
        })

      createTest('xhr requests should have service and version from source code context')
        .withRum(RUM_CONFIG)
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page }) => {
          await page.click('#app1-xhr-button')
          await page.click('#app2-xhr-button')
          await flushEvents()

          const resourceEvents = intakeRegistry.rumResourceEvents.filter((event) => event.resource.type === 'xhr')

          expect(resourceEvents).toMatchObject([
            expect.objectContaining({ service: 'mf-app1-service', version: '1.0.0' }),
            expect.objectContaining({ service: 'mf-app2-service', version: '0.2.0' }),
          ])
        })

      createTest('custom actions should have service and version from source code context')
        .withRum(RUM_CONFIG)
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page }) => {
          await page.click('#app1-custom-action-button')
          await page.click('#app2-custom-action-button')
          await flushEvents()

          const rumActionEvents = intakeRegistry.rumActionEvents.filter((event) => event.action.type === 'custom')

          expect(rumActionEvents).toMatchObject([
            expect.objectContaining({
              service: 'mf-app1-service',
              version: '1.0.0',
            }),
            expect.objectContaining({
              service: 'mf-app2-service',
              version: '0.2.0',
            }),
          ])
        })

      createTest('LOAf should have service and version from source code context')
        .withRum(RUM_CONFIG)
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page }) => {
          await page.click('#app1-loaf-button')
          await page.click('#app2-loaf-button')
          await flushEvents()

          const longTaskEvents = intakeRegistry.rumLongTaskEvents.filter((event) =>
            event.long_task.scripts?.[0]?.invoker?.includes('onclick')
          )

          expect(longTaskEvents).toMatchObject([
            expect.objectContaining({ service: 'mf-app1-service', version: '1.0.0' }),
            expect.objectContaining({ service: 'mf-app2-service', version: '0.2.0' }),
          ])
        })

      createTest('manual views should have service and version from source code context')
        .withRum(RUM_CONFIG)
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page }) => {
          await page.click('#app1-view-button')
          await page.click('#app2-view-button')
          await flushEvents()

          expect(intakeRegistry.rumViewEvents).toMatchObject(
            expect.arrayContaining([
              expect.objectContaining({
                view: expect.objectContaining({ name: 'mf-app1-view' }),
                service: 'mf-app1-service',
                version: '1.0.0',
              }),
              expect.objectContaining({
                view: expect.objectContaining({ name: 'mf-app2-view' }),
                service: 'mf-app2-service',
                version: '0.2.0',
              }),
            ])
          )
        })

      createTest('duration vitals should have service and version from source code context')
        .withRum(RUM_CONFIG)
        .withSetup(microfrontendSetup)
        .run(async ({ intakeRegistry, flushEvents, page }) => {
          await page.click('#app1-vital-button')
          await page.click('#app2-vital-button')
          await flushEvents()

          expect(intakeRegistry.rumVitalEvents).toMatchObject([
            expect.objectContaining({ service: 'mf-app1-service', version: '1.0.0' }),
            expect.objectContaining({ service: 'mf-app2-service', version: '0.2.0' }),
          ])
        })
    })
  })

  test.describe('Logs', () => {
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
