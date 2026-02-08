import type { BufferedData, Payload } from '@datadog/browser-core'
import {
  ErrorSource,
  display,
  STORAGE_POLL_DELAY,
  BufferedObservable,
  FLUSH_DURATION_LIMIT,
} from '@datadog/browser-core'
import type { Clock, Request } from '@datadog/browser-core/test'
import {
  interceptRequests,
  mockEndpointBuilder,
  mockEventBridge,
  registerCleanupTask,
  mockClock,
  DEFAULT_FETCH_MOCK,
} from '@datadog/browser-core/test'

import type { LogsConfiguration } from '../domain/configuration'
import { validateAndBuildLogsConfiguration } from '../domain/configuration'
import { Logger } from '../domain/logger'
import { createHooks } from '../domain/hooks'
import { StatusType } from '../domain/logger/isAuthorized'
import type { LogsEvent } from '../logsEvent.types'
import { createLogsSessionManagerMock } from '../../test/mockLogsSessionManager'
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
const DEFAULT_PAYLOAD = {} as Payload

function startLogsWithDefaults({ configuration }: { configuration?: Partial<LogsConfiguration> } = {}) {
  const endpointBuilder = mockEndpointBuilder('https://localhost/v1/input/log')
  const sessionManager = createLogsSessionManagerMock()
  const { handleLog, stop, globalContext, accountContext, userContext } = startLogs(
    {
      ...validateAndBuildLogsConfiguration({ clientToken: 'xxx', service: 'service', telemetrySampleRate: 0 })!,
      logsEndpointBuilder: endpointBuilder,
      ...configuration,
    },
    sessionManager,
    () => COMMON_CONTEXT,
    new BufferedObservable<BufferedData>(100),
    createHooks()
  )

  registerCleanupTask(stop)

  const logger = new Logger(handleLog)

  return { handleLog, logger, endpointBuilder, globalContext, accountContext, userContext, sessionManager }
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
    it('should send the needed data', async () => {
      const { handleLog, logger, endpointBuilder } = startLogsWithDefaults()

      handleLog(
        { message: 'message', status: StatusType.warn, context: { foo: 'bar' } },
        logger,
        'fake-handling-stack',
        COMMON_CONTEXT
      )

      clock.tick(FLUSH_DURATION_LIMIT)
      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(1)
      expect(requests[0].url).toContain(endpointBuilder.build('fetch', DEFAULT_PAYLOAD))
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
      clock.tick(STORAGE_POLL_DELAY * 2)

      handleLog({ status: StatusType.info, message: 'message 2' }, logger)

      clock.tick(FLUSH_DURATION_LIMIT)
      await interceptor.waitForAllFetchCalls()

      const firstRequest = getLoggedMessage(requests, 0)
      const secondRequest = getLoggedMessage(requests, 1)

      expect(requests.length).toEqual(2)
      expect(firstRequest.message).toEqual('message 1')
      expect(firstRequest.session_id).toEqual('session-id')

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
