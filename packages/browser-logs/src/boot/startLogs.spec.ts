import type { BufferedData } from '@datadog/browser-core'
import { ErrorSource, display, BufferedObservable, FLUSH_DURATION_LIMIT } from '@datadog/browser-core'
import type { Clock, Request } from '@datadog/browser-core/test'
import {
  interceptRequests,
  mockEventBridge,
  registerCleanupTask,
  mockClock,
  DEFAULT_FETCH_MOCK,
  createSessionManagerMock,
  MOCK_SESSION_ID,
  mockSourceCodeContext,
  mockReportingObserver,
  FAKE_REPORT,
} from '@datadog/browser-core/test'

import type { LogsConfiguration } from '../domain/configuration'
import { validateAndBuildLogsConfiguration } from '../domain/configuration'
import { Logger } from '../domain/logger'
import { createHooks } from '../domain/hooks'
import { StatusType } from '../domain/logger/isAuthorized'
import type { LogsEvent } from '../logsEvent.types'
import { startLogs } from './startLogs'

function getLoggedMessage(requests: Request[], index: number) {
  return JSON.parse(requests[index].body) as LogsEvent
}

interface Rum {
  getInternalContext(startTime?: number): any
}
declare global {
  interface Window {
    DD_RUM?: Rum
    DD_RUM_SYNTHETICS?: Rum
  }
}

const DEFAULT_MESSAGE = { status: StatusType.info, message: 'message' }
const COMMON_CONTEXT = {
  view: { referrer: 'common_referrer', url: 'common_url' },
}

function startLogsWithDefaults({ configuration }: { configuration?: Partial<LogsConfiguration> } = {}) {
  const sessionManager = createSessionManagerMock()
  const { handleLog, stop, globalContext, accountContext, userContext } = startLogs(
    {
      ...validateAndBuildLogsConfiguration({ clientToken: 'xxx', service: 'service', telemetrySampleRate: 0 })!,
      ...configuration,
    },
    sessionManager,
    () => COMMON_CONTEXT,
    new BufferedObservable<BufferedData>(100),
    createHooks()
  )

  registerCleanupTask(stop)

  const logger = new Logger(handleLog)

  return { handleLog, logger, globalContext, accountContext, userContext, sessionManager }
}

describe('logs', () => {
  let interceptor: ReturnType<typeof interceptRequests>
  let requests: Request[]
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    interceptor = interceptRequests()
    requests = interceptor.requests
  })

  afterEach(() => {
    delete window.DD_RUM
  })

  describe('request', () => {
    it('attributes deprecation warnings from the original report without serializing it', async () => {
      const reportingObserver = mockReportingObserver()
      mockSourceCodeContext({
        'Error\n    at deprecatedApi (http://foo.bar/index.js:20:10)': { service: 'checkout', version: '1.2.3' },
      })
      const beforeSend = jasmine.createSpy('beforeSend')
      startLogsWithDefaults({
        configuration: { beforeSend, forwardReports: ['deprecation'], version: 'shell-version' },
      })

      reportingObserver.raiseReport('deprecation')
      clock.tick(FLUSH_DURATION_LIMIT)
      await interceptor.waitForAllFetchCalls()

      expect(beforeSend).toHaveBeenCalledOnceWith(
        jasmine.objectContaining({
          status: StatusType.warn,
          service: 'checkout',
          version: '1.2.3',
          ddtags: 'sdk_version:test,service:checkout,version:1.2.3',
        }),
        { report: { ...FAKE_REPORT, type: 'deprecation' } }
      )
      const log = getLoggedMessage(requests, 0)
      expect(log).toEqual(
        jasmine.objectContaining({
          message: 'deprecation: foo bar Found in http://foo.bar/index.js:20:10',
          status: StatusType.warn,
          origin: ErrorSource.REPORT,
          service: 'checkout',
          version: '1.2.3',
          ddtags: 'sdk_version:test,service:checkout,version:1.2.3',
        })
      )
      expect(log.error).toBeUndefined()
      expect(log.report).toBeUndefined()
      expect(log.domainContext).toBeUndefined()
    })

    it('sends source code service and version as attributes and tags for errors passed to a logger', async () => {
      const stack = 'Error: checkout failed\n    at checkout (https://example.com/checkout.js:42:10)'
      mockSourceCodeContext({ [stack]: { service: 'checkout', version: '1.2.3', ddDebugId: 'debug-id' } })
      const beforeSend = jasmine.createSpy('beforeSend')
      const { logger } = startLogsWithDefaults({ configuration: { beforeSend, version: 'global-version' } })
      const error = new Error('checkout failed')
      error.stack = stack

      logger.error('Checkout failed', undefined, error)
      clock.tick(FLUSH_DURATION_LIMIT)
      await interceptor.waitForAllFetchCalls()

      expect(beforeSend).toHaveBeenCalledWith(
        jasmine.objectContaining({
          service: 'checkout',
          version: '1.2.3',
          ddtags: 'sdk_version:test,service:checkout,version:1.2.3',
        }),
        jasmine.anything()
      )
      const log = getLoggedMessage(requests, 0)
      expect(log).toEqual(
        jasmine.objectContaining({
          service: 'checkout',
          version: '1.2.3',
          ddtags: 'sdk_version:test,service:checkout,version:1.2.3',
          _dd: { debug_ids: [{ url: 'https://example.com/checkout.js', id: 'debug-id' }] },
        })
      )
    })

    ;[
      { context: { service: 'checkout' }, service: 'checkout', version: 'global-version' },
      { context: { version: '1.2.3' }, service: 'global-service', version: '1.2.3' },
      { context: { ddDebugId: 'debug-id' }, service: 'global-service', version: 'global-version' },
    ].forEach(({ context, service, version }) => {
      it(`preserves other context and configuration values when source code context contains only ${Object.keys(context)[0]}`, () => {
        const stack = 'Error\n    at checkout (https://example.com/checkout.js:42:10)'
        mockSourceCodeContext({ [stack]: context })
        const beforeSend = jasmine.createSpy('beforeSend')
        const { handleLog, logger, globalContext } = startLogsWithDefaults({
          configuration: { beforeSend, version: 'global-version' },
        })
        globalContext.setContext({ service: 'global-service' })

        handleLog(DEFAULT_MESSAGE, logger, stack)

        expect(beforeSend).toHaveBeenCalledWith(
          jasmine.objectContaining({
            service,
            version,
            ddtags: `sdk_version:test,service:${service},version:${version}`,
          }),
          { handlingStack: stack }
        )
      })
    })

    ;['customer-tags', null, { service: 'customer-service', version: 'customer-version', env: 'customer-env' }].forEach(
      (tags) => {
        ;['setContext', 'setContextProperty'].forEach((setter) => {
          it(`preserves customer tags from ${setter}: ${JSON.stringify(tags)}`, async () => {
            const stack = 'Error\n    at checkout (https://example.com/checkout.js:42:10)'
            mockSourceCodeContext({ [stack]: { service: 'checkout' } })
            const beforeSend = jasmine.createSpy('beforeSend')
            const { handleLog, logger, globalContext } = startLogsWithDefaults({
              configuration: { beforeSend, version: 'global-version' },
            })
            if (setter === 'setContext') {
              globalContext.setContext({ tags })
            } else {
              globalContext.setContextProperty('tags', tags)
            }

            handleLog(DEFAULT_MESSAGE, logger)
            expect(beforeSend).toHaveBeenCalledWith(
              jasmine.objectContaining({ tags, ddtags: 'sdk_version:test,service:service,version:global-version' }),
              undefined
            )
            handleLog(DEFAULT_MESSAGE, logger, stack)
            expect(beforeSend).toHaveBeenCalledWith(
              jasmine.objectContaining({ tags, ddtags: 'sdk_version:test,service:checkout,version:global-version' }),
              { handlingStack: stack }
            )

            clock.tick(FLUSH_DURATION_LIMIT)
            await interceptor.waitForAllFetchCalls()
            const logs = requests[0].body.split('\n').map((log) => JSON.parse(log) as LogsEvent)
            expect(logs).toEqual([
              jasmine.objectContaining({ tags, ddtags: 'sdk_version:test,service:service,version:global-version' }),
              jasmine.objectContaining({ tags, ddtags: 'sdk_version:test,service:checkout,version:global-version' }),
            ])
          })
        })
      }
    )

    it('allows logger service/version context and beforeSend tag overrides', async () => {
      const stack = 'Error\n    at checkout (https://example.com/checkout.js:42:10)'
      mockSourceCodeContext({ [stack]: { service: 'checkout', version: '1.2.3' } })
      const { handleLog, logger } = startLogsWithDefaults({
        configuration: {
          beforeSend(log) {
            expect(log.service).toBe('logger-service')
            expect(log.version).toBe('logger-version')
            expect(log.ddtags).toBe('sdk_version:test,service:logger-service,version:logger-version')
            log.service = 'before-send-service'
            log.ddtags = 'sdk_version:test,service:before-send-service,version:before-send-version'
          },
        },
      })
      logger.setContext({ service: 'logger-service', version: 'logger-version' })

      handleLog(DEFAULT_MESSAGE, logger, stack)
      clock.tick(FLUSH_DURATION_LIMIT)
      await interceptor.waitForAllFetchCalls()

      expect(getLoggedMessage(requests, 0)).toEqual(
        jasmine.objectContaining({
          service: 'before-send-service',
          ddtags: 'sdk_version:test,service:before-send-service,version:before-send-version',
        })
      )
    })

    it('should send the needed data', async () => {
      const { handleLog, logger } = startLogsWithDefaults()

      handleLog(
        { message: 'message', status: StatusType.warn, context: { foo: 'bar' } },
        logger,
        'fake-handling-stack',
        COMMON_CONTEXT
      )

      clock.tick(FLUSH_DURATION_LIMIT)
      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(1)
      expect(requests[0].url).toMatch(
        /^https:\/\/browser-intake-datadoghq\.com\/api\/v2\/logs\?ddsource=browser&dd-api-key=xxx&dd-evp-origin-version=test&dd-evp-origin=browser&dd-request-id=/
      )
      expect(getLoggedMessage(requests, 0)).toEqual({
        date: jasmine.any(Number),
        foo: 'bar',
        message: 'message',
        service: 'service',
        ddtags: 'sdk_version:test,service:service',
        session_id: jasmine.any(String),
        session: {
          id: jasmine.any(String),
        },
        status: StatusType.warn,
        view: {
          referrer: 'common_referrer',
          url: 'common_url',
        },
        origin: ErrorSource.LOGGER,
        usr: {
          anonymous_id: jasmine.any(String),
        },
        tab: {
          id: jasmine.any(String),
        },
        _dd: {},
      })
    })

    it('should all use the same batch', async () => {
      const { handleLog, logger } = startLogsWithDefaults()

      handleLog(DEFAULT_MESSAGE, logger)
      handleLog(DEFAULT_MESSAGE, logger)
      handleLog(DEFAULT_MESSAGE, logger)

      clock.tick(FLUSH_DURATION_LIMIT)
      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(1)
    })

    it('should send bridge event when bridge is present', () => {
      const sendSpy = spyOn(mockEventBridge(), 'send')
      const { handleLog, logger } = startLogsWithDefaults()

      handleLog(DEFAULT_MESSAGE, logger)

      clock.tick(FLUSH_DURATION_LIMIT)

      expect(requests.length).toEqual(0)
      const [message] = sendSpy.calls.mostRecent().args
      const parsedMessage = JSON.parse(message)
      expect(parsedMessage).toEqual({
        eventType: 'log',
        event: jasmine.objectContaining({ message: 'message' }),
      })
    })
  })

  it('should not print the log twice when console handler is enabled', () => {
    const consoleLogSpy = spyOn(console, 'log')
    const displayLogSpy = spyOn(display, 'log')
    startLogsWithDefaults({
      configuration: { forwardConsoleLogs: ['log'] },
    })

    /* eslint-disable-next-line no-console */
    console.log('foo', 'bar')

    expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    expect(displayLogSpy).not.toHaveBeenCalled()
  })

  describe('session lifecycle', () => {
    it('sends logs without session id when the session expires ', async () => {
      const { handleLog, logger, sessionManager } = startLogsWithDefaults()

      interceptor.withFetch(DEFAULT_FETCH_MOCK, DEFAULT_FETCH_MOCK)

      handleLog({ status: StatusType.info, message: 'message 1' }, logger)

      sessionManager.expire()

      handleLog({ status: StatusType.info, message: 'message 2' }, logger)

      clock.tick(FLUSH_DURATION_LIMIT)
      await interceptor.waitForAllFetchCalls()

      const firstRequest = getLoggedMessage(requests, 0)
      const secondRequest = getLoggedMessage(requests, 1)

      expect(requests.length).toEqual(2)
      expect(firstRequest.message).toEqual('message 1')
      expect(firstRequest.session_id).toEqual(MOCK_SESSION_ID)

      expect(secondRequest.message).toEqual('message 2')
      expect(secondRequest.session_id).toBeUndefined()
    })
  })

  describe('contexts precedence', () => {
    it('global context should take precedence over session', () => {
      const { handleLog, logger, globalContext } = startLogsWithDefaults()
      globalContext.setContext({ session_id: 'from-global-context' })

      handleLog({ status: StatusType.info, message: 'message 1' }, logger)

      clock.tick(FLUSH_DURATION_LIMIT)

      const firstRequest = getLoggedMessage(requests, 0)
      expect(firstRequest.session_id).toEqual('from-global-context')
    })

    it('global context should take precedence over account', () => {
      const { handleLog, logger, globalContext, accountContext } = startLogsWithDefaults()
      globalContext.setContext({ account: { id: 'from-global-context' } })
      accountContext.setContext({ id: 'from-account-context' })

      handleLog({ status: StatusType.info, message: 'message 1' }, logger)

      clock.tick(FLUSH_DURATION_LIMIT)

      const firstRequest = getLoggedMessage(requests, 0)
      expect(firstRequest.account).toEqual({ id: 'from-global-context' })
    })

    it('global context should take precedence over usr', () => {
      const { handleLog, logger, globalContext, userContext } = startLogsWithDefaults()
      globalContext.setContext({ usr: { id: 'from-global-context' } })
      userContext.setContext({ id: 'from-user-context' })

      handleLog({ status: StatusType.info, message: 'message 1' }, logger)

      clock.tick(FLUSH_DURATION_LIMIT)

      const firstRequest = getLoggedMessage(requests, 0)
      expect(firstRequest.usr).toEqual(jasmine.objectContaining({ id: 'from-global-context' }))
    })

    it('RUM context should take precedence over global context', () => {
      const { handleLog, logger, globalContext } = startLogsWithDefaults()
      window.DD_RUM = {
        getInternalContext: () => ({ view: { url: 'from-rum-context' } }),
      }
      globalContext.setContext({ view: { url: 'from-global-context' } })

      handleLog({ status: StatusType.info, message: 'message 1' }, logger)

      clock.tick(FLUSH_DURATION_LIMIT)

      const firstRequest = getLoggedMessage(requests, 0)
      expect(firstRequest.view.url).toEqual('from-rum-context')
    })
  })
})
