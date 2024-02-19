import type { Payload } from '@datadog/browser-core'
import {
  ErrorSource,
  display,
  stopSessionManager,
  getCookie,
  SESSION_STORE_KEY,
  createCustomerDataTracker,
  noop,
  createTrackingConsentState,
  TrackingConsent,
  setCookie,
  STORAGE_POLL_DELAY,
  ONE_MINUTE,
} from '@datadog/browser-core'
import type { Clock, Request } from '@datadog/browser-core/test'
import {
  interceptRequests,
  stubEndpointBuilder,
  deleteEventBridgeStub,
  initEventBridgeStub,
  cleanupSyntheticsWorkerValues,
  mockSyntheticsWorkerValues,
  registerCleanupTask,
  mockClock,
  createNewEvent,
} from '@datadog/browser-core/test'

import { SESSION_EXPIRATION_DELAY } from 'packages/core/src/domain/session/sessionConstants'
import type { LogsConfiguration } from '../domain/configuration'
import { validateAndBuildLogsConfiguration } from '../domain/configuration'
import { HandlerType, Logger, StatusType } from '../domain/logger'
import type { startLoggerCollection } from '../domain/logger/loggerCollection'
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
}
const DEFAULT_PAYLOAD = {} as Payload

describe('logs', () => {
  const initConfiguration = { clientToken: 'xxx', service: 'service', telemetrySampleRate: 0 }
  let baseConfiguration: LogsConfiguration
  let interceptor: ReturnType<typeof interceptRequests>
  let requests: Request[]
  let handleLog: ReturnType<typeof startLoggerCollection>['handleLog']
  let stopLogs: () => void
  let logger: Logger
  let consoleLogSpy: jasmine.Spy
  let displayLogSpy: jasmine.Spy

  beforeEach(() => {
    baseConfiguration = {
      ...validateAndBuildLogsConfiguration(initConfiguration)!,
      logsEndpointBuilder: stubEndpointBuilder('https://localhost/v1/input/log'),
      batchMessagesLimit: 1,
    }
    logger = new Logger((...params) => handleLog(...params), createCustomerDataTracker(noop))
    interceptor = interceptRequests()
    requests = interceptor.requests
    consoleLogSpy = spyOn(console, 'log')
    displayLogSpy = spyOn(display, 'log')
  })

  afterEach(() => {
    delete window.DD_RUM
    deleteEventBridgeStub()
    stopSessionManager()
    interceptor.restore()
  })

  describe('request', () => {
    it('should send the needed data', () => {
      ;({ handleLog, stop: stopLogs } = startLogs(
        initConfiguration,
        baseConfiguration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopLogs)

      handleLog({ message: 'message', status: StatusType.warn, context: { foo: 'bar' } }, logger, COMMON_CONTEXT)

      expect(requests.length).toEqual(1)
      expect(requests[0].url).toContain(baseConfiguration.logsEndpointBuilder.build('xhr', DEFAULT_PAYLOAD))
      expect(getLoggedMessage(requests, 0)).toEqual({
        date: jasmine.any(Number),
        foo: 'bar',
        message: 'message',
        service: 'service',
        session_id: jasmine.any(String),
        status: StatusType.warn,
        view: {
          referrer: 'common_referrer',
          url: 'common_url',
        },
        origin: ErrorSource.LOGGER,
      })
    })

    it('should all use the same batch', () => {
      ;({ handleLog, stop: stopLogs } = startLogs(
        initConfiguration,
        { ...baseConfiguration, batchMessagesLimit: 3 },
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopLogs)

      handleLog(DEFAULT_MESSAGE, logger)
      handleLog(DEFAULT_MESSAGE, logger)
      handleLog(DEFAULT_MESSAGE, logger)

      expect(requests.length).toEqual(1)
    })

    it('should send bridge event when bridge is present', () => {
      const sendSpy = spyOn(initEventBridgeStub(), 'send')
      ;({ handleLog, stop: stopLogs } = startLogs(
        initConfiguration,
        baseConfiguration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopLogs)

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
    it('should be applied when event bridge is present', () => {
      const sendSpy = spyOn(initEventBridgeStub(), 'send')

      let configuration = { ...baseConfiguration, sessionSampleRate: 0 }
      ;({ handleLog, stop: stopLogs } = startLogs(
        initConfiguration,
        configuration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopLogs)
      handleLog(DEFAULT_MESSAGE, logger)

      expect(sendSpy).not.toHaveBeenCalled()

      configuration = { ...baseConfiguration, sessionSampleRate: 100 }
      ;({ handleLog, stop: stopLogs } = startLogs(
        initConfiguration,
        configuration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopLogs)
      handleLog(DEFAULT_MESSAGE, logger)

      expect(sendSpy).toHaveBeenCalled()
    })
  })

  it('should not print the log twice when console handler is enabled', () => {
    logger.setHandler([HandlerType.console])
    ;({ handleLog, stop: stopLogs } = startLogs(
      initConfiguration,
      { ...baseConfiguration, forwardConsoleLogs: ['log'] },
      () => COMMON_CONTEXT,
      createTrackingConsentState(TrackingConsent.GRANTED)
    ))
    registerCleanupTask(stopLogs)

    /* eslint-disable-next-line no-console */
    console.log('foo', 'bar')

    expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    expect(displayLogSpy).not.toHaveBeenCalled()
  })

  describe('logs session creation', () => {
    afterEach(() => {
      cleanupSyntheticsWorkerValues()
    })

    it('creates a session on normal conditions', () => {
      ;({ handleLog, stop: stopLogs } = startLogs(
        initConfiguration,
        baseConfiguration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopLogs)

      expect(getCookie(SESSION_STORE_KEY)).not.toBeUndefined()
    })

    it('does not create a session if event bridge is present', () => {
      initEventBridgeStub()
      ;({ handleLog, stop: stopLogs } = startLogs(
        initConfiguration,
        baseConfiguration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopLogs)

      expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()
    })

    it('does not create a session if synthetics worker will inject RUM', () => {
      mockSyntheticsWorkerValues({ injectsRum: true })
      ;({ handleLog, stop: stopLogs } = startLogs(
        initConfiguration,
        baseConfiguration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopLogs)

      expect(getCookie(SESSION_STORE_KEY)).toBeUndefined()
    })
  })

  // it('if new session is not tracked, renew the session so that logs sdk stop sending events', () => {
  //   ;({ handleLog, stop: stopLogs } = startLogs(
  //     initConfiguration,
  //     baseConfiguration,
  //     () => COMMON_CONTEXT,
  //     createTrackingConsentState(TrackingConsent.GRANTED)
  //   ))
  //   registerCleanupTask(stopLogs)

  //   expect(getCookie(SESSION_STORE_KEY)).not.toBeUndefined()
  // })

  describe('session lifecycle', () => {
    let clock: Clock
    beforeEach(() => {
      clock = mockClock()
    })
    afterEach(() => {
      clock.cleanup()
    })

    it('when the renewed session is not tracked, stop sending events', () => {
      setCookie(SESSION_STORE_KEY, 'id=foo&logs=1', ONE_MINUTE)
      ;({ handleLog, stop: stopLogs } = startLogs(
        initConfiguration,
        baseConfiguration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopLogs)

      handleLog({ status: StatusType.info, message: 'message 1' }, logger)

      // renew untracked session
      setCookie(SESSION_STORE_KEY, 'id=bar&logs=0', 1000)
      clock.tick(STORAGE_POLL_DELAY)

      handleLog({ status: StatusType.info, message: 'message 2' }, logger)

      expect(requests.length).toEqual(1)
      expect(getLoggedMessage(requests, 0)).toEqual(
        jasmine.objectContaining({
          message: 'message 1',
          session_id: jasmine.any(String),
        })
      )
    })

    it('when the session expires keep sending logs without session id', () => {
      setCookie(SESSION_STORE_KEY, 'id=foo&logs=1', ONE_MINUTE)
      ;({ handleLog, stop: stopLogs } = startLogs(
        initConfiguration,
        baseConfiguration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopLogs)

      handleLog({ status: StatusType.info, message: 'message 1' }, logger)

      // expire session
      setCookie(SESSION_STORE_KEY, '', ONE_MINUTE)
      clock.tick(STORAGE_POLL_DELAY)

      handleLog({ status: StatusType.info, message: 'message 2' }, logger)

      const firstRequest = getLoggedMessage(requests, 0)
      const secondRequest = getLoggedMessage(requests, 1)

      expect(requests.length).toEqual(2)
      expect(firstRequest.message).toEqual('message 1')
      expect(firstRequest.session_id).toEqual('foo')

      expect(secondRequest.message).toEqual('message 2')
      expect(secondRequest.session_id).toBeUndefined()
    })
  })
})
