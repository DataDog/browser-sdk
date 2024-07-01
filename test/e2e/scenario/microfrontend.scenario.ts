import type { RumEvent, RumEventDomainContext, RumInitConfiguration } from '@datadog/browser-rum-core'
import type { LogsEvent, LogsInitConfiguration, LogsEventDomainContext } from '@datadog/browser-logs'
import { flushBrowserLogs, withBrowserLogs } from '../lib/helpers/browser'
import { flushEvents, createTest } from '../lib/framework'

const HANDLING_STACK_REGEX = /^Error: \n\s+at testHandlingStack @/

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

describe('microfrontend', () => {
  createTest('expose handling stack for fetch requests')
    .withRum(RUM_CONFIG)
    .withRumInit((configuration) => {
      window.DD_RUM!.init(configuration)

      const noop = () => {}
      function testHandlingStack() {
        fetch('/ok').then(noop, noop)
      }

      testHandlingStack()
    })
    .run(async ({ intakeRegistry }) => {
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
    .run(async ({ intakeRegistry }) => {
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
    .run(async ({ intakeRegistry }) => {
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
    .run(async ({ intakeRegistry }) => {
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
    .run(async ({ intakeRegistry }) => {
      await flushEvents()

      const event = intakeRegistry.rumErrorEvents[0]

      await withBrowserLogs((logs) => {
        expect(logs.length).toBe(1)
        expect(logs[0].message).toMatch(/"foo"$/)
      })

      expect(event).toBeTruthy()
      expect(event?.context?.handlingStack).toMatch(HANDLING_STACK_REGEX)
    })

  describe('console apis', () => {
    createTest('expose handling stack for console.log')
      .withLogs(LOGS_CONFIG)
      .withLogsInit((configuration) => {
        window.DD_LOGS!.init(configuration)

        function testHandlingStack() {
          console.log('foo')
        }

        testHandlingStack()
      })
      .run(async ({ intakeRegistry }) => {
        await flushEvents()

        const event = intakeRegistry.logsEvents[0]

        await flushBrowserLogs()

        expect(event).toBeTruthy()
        expect(event?.context).toEqual({
          handlingStack: jasmine.stringMatching(HANDLING_STACK_REGEX),
        })
      })
  })

  describe('logger apis', () => {
    createTest('expose handling stack for DD_LOGS.logger.log')
      .withLogs(LOGS_CONFIG)
      .withLogsInit((configuration) => {
        window.DD_LOGS!.init(configuration)

        function testHandlingStack() {
          window.DD_LOGS!.logger.log('foo')
        }

        testHandlingStack()
      })
      .run(async ({ intakeRegistry }) => {
        await flushEvents()

        const event = intakeRegistry.logsEvents[0]

        await flushBrowserLogs()

        expect(event).toBeTruthy()
        expect(event?.context).toEqual({
          handlingStack: jasmine.stringMatching(HANDLING_STACK_REGEX),
        })
      })
  })

  createTest('allow to modify service and version')
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
    .run(async ({ intakeRegistry }) => {
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
})
