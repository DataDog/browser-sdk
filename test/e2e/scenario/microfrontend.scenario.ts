import type { RumEvent, RumEventDomainContext, RumInitConfiguration } from '@datadog/browser-rum-core'
import type { LogsEvent, LogsInitConfiguration, LogsEventDomainContext } from '@datadog/browser-logs'
import type { Page } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { ExperimentalFeature } from '@datadog/browser-core'
import { createTest, html } from '../lib/framework'

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

// Use createBody because `page.evaluate()` runs in a different context and breaks stack traces.
function createBody(eventGenerator: string) {
  return html`
    <button>click me</button>
    <script>
      const button = document.querySelector('button')
      button.addEventListener('click', function handler() {
        ${eventGenerator}
      })
    </script>
  `
}

function setSourceCodeContext(page: Page, baseUrl: string) {
  return page.evaluate((baseUrl) => {
    window.DD_SOURCE_CODE_CONTEXT = {
      [`Error: Test error
    at testFunction (${baseUrl}:41:27)`]: {
        service: 'mf-service',
        version: '0.1.0',
      },
    }
  }, baseUrl)
}

test.describe('microfrontend', () => {
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

  test.describe('console apis', () => {
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
  })

  test.describe('logger apis', () => {
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

  test.describe('source code context', () => {
    createTest('errors from DD_RUM.addError should have service and version from source code context')
      .withRum(RUM_CONFIG)
      .withBody(createBody('window.DD_RUM.addError(new Error("foo"))'))
      .run(async ({ intakeRegistry, flushEvents, page, baseUrl }) => {
        await setSourceCodeContext(page, baseUrl)
        await page.locator('button').click()
        await flushEvents()

        const errorEvent = intakeRegistry.rumErrorEvents[0]
        expect(errorEvent).toMatchObject({ service: 'mf-service', version: '0.1.0' })
      })

    createTest('errors from console.error should have service and version from source code context')
      .withRum(RUM_CONFIG)
      .withBody(createBody('console.error("foo")'))
      .run(async ({ intakeRegistry, flushEvents, page, baseUrl, withBrowserLogs }) => {
        await setSourceCodeContext(page, baseUrl)
        await page.locator('button').click()
        await flushEvents()

        const errorEvent = intakeRegistry.rumErrorEvents[0]
        expect(errorEvent).toMatchObject({ service: 'mf-service', version: '0.1.0' })

        withBrowserLogs((browserLogs) => {
          expect(browserLogs).toHaveLength(1)
        })
      })

    createTest('runtime errors should have service and version from source code context')
      .withRum(RUM_CONFIG)
      .withBody(createBody('throw new Error("oh snap")'))
      .run(async ({ intakeRegistry, flushEvents, page, baseUrl, withBrowserLogs }) => {
        await setSourceCodeContext(page, baseUrl)
        await page.locator('button').click()
        await flushEvents()

        const errorEvent = intakeRegistry.rumErrorEvents[0]
        expect(errorEvent).toMatchObject({ service: 'mf-service', version: '0.1.0' })

        withBrowserLogs((browserLogs) => {
          expect(browserLogs).toHaveLength(1)
        })
      })

    createTest('fetch requests should have service and version from source code context')
      .withRum(RUM_CONFIG)
      .withBody(createBody('fetch("/ok").then(() => {}, () => {})'))
      .run(async ({ intakeRegistry, flushEvents, page, baseUrl }) => {
        await setSourceCodeContext(page, baseUrl)
        await page.locator('button').click()
        await flushEvents()

        const resourceEvent = intakeRegistry.rumResourceEvents.find((event) => event.resource.type === 'fetch')!
        expect(resourceEvent).toMatchObject({ service: 'mf-service', version: '0.1.0' })
      })

    createTest('xhr requests should have service and version from source code context')
      .withRum(RUM_CONFIG)
      .withBody(createBody("const xhr = new XMLHttpRequest(); xhr.open('GET', '/ok'); xhr.send();"))
      .run(async ({ intakeRegistry, flushEvents, page, baseUrl }) => {
        await setSourceCodeContext(page, baseUrl)
        await page.locator('button').click()
        await flushEvents()

        const resourceEvent = intakeRegistry.rumResourceEvents.find((event) => event.resource.type === 'xhr')!
        expect(resourceEvent).toMatchObject({ service: 'mf-service', version: '0.1.0' })
      })

    createTest('custom actions should have service and version from source code context')
      .withRum(RUM_CONFIG)
      .withBody(createBody("window.DD_RUM.addAction('foo')"))
      .run(async ({ intakeRegistry, flushEvents, page, baseUrl }) => {
        await setSourceCodeContext(page, baseUrl)
        await page.locator('button').click()
        await flushEvents()

        const actionEvent = intakeRegistry.rumActionEvents[0]
        expect(actionEvent).toMatchObject({ service: 'mf-service', version: '0.1.0' })
      })

    createTest('LOAf should have service and version from source code context')
      .withRum(RUM_CONFIG)
      .withBody(
        createBody(`
            const end = performance.now() + 55
            while (performance.now() < end) {} // block the handler for ~55ms to trigger a long task
          `)
      )
      .run(async ({ intakeRegistry, flushEvents, page, baseUrl, browserName }) => {
        test.skip(browserName !== 'chromium', 'Non-Chromium browsers do not support long tasks')

        await setSourceCodeContext(page, baseUrl)
        await page.locator('button').click()
        await flushEvents()

        const longTaskEvent = intakeRegistry.rumLongTaskEvents.find((event) =>
          event.long_task.scripts?.[0]?.invoker?.includes('BUTTON.onclick')
        )

        expect(longTaskEvent).toMatchObject({ service: 'mf-service', version: '0.1.0' })
      })
  })
})
