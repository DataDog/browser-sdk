import type { EarlyData, Payload } from '@datadog/browser-core'
import {
  ErrorSource,
  display,
  stopSessionManager,
  getCookie,
  SESSION_STORE_KEY,
  createTrackingConsentState,
  TrackingConsent,
  setCookie,
  STORAGE_POLL_DELAY,
  ONE_MINUTE,
  BufferedObservable,
} from '@datadog/browser-core'
import type { Clock, Request } from '@datadog/browser-core/test'
import {
  interceptRequests,
  mockEndpointBuilder,
  mockEventBridge,
  mockSyntheticsWorkerValues,
  registerCleanupTask,
  mockClock,
  expireCookie,
  DEFAULT_FETCH_MOCK,
} from '@datadog/browser-core/test'

import type { LogsConfiguration } from '../domain/configuration'
import { validateAndBuildLogsConfiguration } from '../domain/configuration'
import { Logger } from '../domain/logger'
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
  context: {},
  user: {},
  account: {},
}
const DEFAULT_PAYLOAD = {} as Payload

function startLogsWithDefaults({ configuration }: { configuration?: Partial<LogsConfiguration> } = {}) {
  const endpointBuilder = mockEndpointBuilder('https://localhost/v1/input/log')
  const { handleLog, stop, globalContext, accountContext } = startLogs(
    {
      ...validateAndBuildLogsConfiguration({ clientToken: 'xxx', service: 'service', telemetrySampleRate: 0 })!,
      logsEndpointBuilder: endpointBuilder,
      batchMessagesLimit: 1,
      ...configuration,
    },
    () => COMMON_CONTEXT,
    createTrackingConsentState(TrackingConsent.GRANTED),
    new BufferedObservable<EarlyData>(100)
  )

  registerCleanupTask(stop)

  const logger = new Logger(handleLog)

  return { handleLog, logger, endpointBuilder, globalContext, accountContext }
}

describe('logs', () => {
  let interceptor: ReturnType<typeof interceptRequests>
  let requests: Request[]

  beforeEach(() => {
    interceptor = interceptRequests()
    requests = interceptor.requests
  })

  afterEach(() => {
    delete window.DD_RUM
    stopSessionManager()
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

      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(1)
      expect(requests[0].url).toContain(endpointBuilder.build('fetch', DEFAULT_PAYLOAD))
      expect(getLoggedMessage(requests, 0)).toEqual({
        date: jasmine.any(Number),
        foo: 'bar',
        message: 'message',
        service: 'service',
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
      const { handleLog, logger } = startLogsWithDefaults({
        configuration: { batchMessagesLimit: 3 },
      })

      handleLog(DEFAULT_MESSAGE, logger)
      handleLog(DEFAULT_MESSAGE, logger)
      handleLog(DEFAULT_MESSAGE, logger)

      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(1)
    })

    it('should send bridge event when bridge is present', () => {
      const sendSpy = spyOn(mockEventBridge(), 'send')
      const { handleLog, logger } = startLogsWithDefaults()

      handleLog(DEFAULT_MESSAGE, logger)

      expect(requests.length).toEqual(0)
      const [message] = sendSpy.calls.mostRecent().args
      const parsedMessage = JSON.parse(message)
      expect(parsedMessage).toEqual({
        eventType: 'log',
        event: jasmine.objectContaining({ message: 'message' }),
      })
    })
  })

  describe('sampling', () => {
    it('should be applied when event bridge is present (rate 0)', () => {
      const sendSpy = spyOn(mockEventBridge(), 'send')

      const { handleLog, logger } = startLogsWithDefaults({
        configuration: { sessionSampleRate: 0 },
      })
      handleLog(DEFAULT_MESSAGE, logger)

      expect(sendSpy).not.toHaveBeenCalled()
    })

    it('should be applied when event bridge is present (rate 100)', () => {
      const sendSpy = spyOn(mockEventBridge(), 'send')

      const { handleLog, logger } = startLogsWithDefaults({
        configuration: { sessionSampleRate: 100 },
      })
      handleLog(DEFAULT_MESSAGE, logger)

      expect(sendSpy).toHaveBeenCalled()
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

  describe('logs session creation', () => {
    it('creates a session on normal conditions', () => {
      startLogsWithDefaults()
      expect(getCookie(SESSION_STORE_KEY)).toBeDefined()
    })

    it('does not create a session if event bridge is present', () => {
      mockEventBridge()
      startLogsWithDefaults()
      expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()
    })

    it('does not create a session if synthetics worker will inject RUM', () => {
      mockSyntheticsWorkerValues({ injectsRum: true })
      startLogsWithDefaults()
      expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()
    })
  })

  describe('session lifecycle', () => {
    let clock: Clock
    beforeEach(() => {
      clock = mockClock()
    })

    it('sends logs without session id when the session expires ', async () => {
      setCookie(SESSION_STORE_KEY, 'id=foo&logs=1', ONE_MINUTE)
      const { handleLog, logger } = startLogsWithDefaults()

      interceptor.withFetch(DEFAULT_FETCH_MOCK, DEFAULT_FETCH_MOCK)

      handleLog({ status: StatusType.info, message: 'message 1' }, logger)

      expireCookie()
      clock.tick(STORAGE_POLL_DELAY * 2)

      handleLog({ status: StatusType.info, message: 'message 2' }, logger)

      await interceptor.waitForAllFetchCalls()

      const firstRequest = getLoggedMessage(requests, 0)
      const secondRequest = getLoggedMessage(requests, 1)

      expect(requests.length).toEqual(2)
      expect(firstRequest.message).toEqual('message 1')
      expect(firstRequest.session_id).toEqual('foo')

      expect(secondRequest.message).toEqual('message 2')
      expect(secondRequest.session_id).toBeUndefined()
    })
  })

  describe('contexts precedence', () => {
    it('global context should take precedence over account', () => {
      const { handleLog, logger, globalContext, accountContext } = startLogsWithDefaults()
      globalContext.setContext({ account: 'from-global-context' })
      accountContext.setContext({ id: 'from-account-context' })

      handleLog({ status: StatusType.info, message: 'message 1' }, logger)

      const firstRequest = getLoggedMessage(requests, 0)
      expect(firstRequest.account).toEqual('from-global-context')
    })

    it('RUM context should take precedence over global context', () => {
      const { handleLog, logger, globalContext } = startLogsWithDefaults()
      window.DD_RUM = {
        getInternalContext: () => ({ view: { url: 'from-rum-context' } }),
      }
      globalContext.setContext({ view: { url: 'from-global-context' } })

      handleLog({ status: StatusType.info, message: 'message 1' }, logger)

      const firstRequest = getLoggedMessage(requests, 0)
      expect(firstRequest.view.url).toEqual('from-rum-context')
    })
  })
})
