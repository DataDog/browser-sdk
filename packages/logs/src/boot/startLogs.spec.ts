import type { ConsoleLog, Context, RawError, RelativeTime, RawReport, TimeStamp } from '@datadog/browser-core'
import {
  ErrorSource,
  noop,
  Observable,
  ONE_MINUTE,
  resetExperimentalFeatures,
  updateExperimentalFeatures,
  getTimeStamp,
  stopSessionManager,
  display,
  initConsoleObservable,
} from '@datadog/browser-core'
import sinon from 'sinon'
import type { Clock } from '../../../core/test/specHelper'
import {
  deleteEventBridgeStub,
  initEventBridgeStub,
  mockClock,
  stubEndpointBuilder,
} from '../../../core/test/specHelper'
import { stubReportingObserver } from '../../../core/test/stubReportApis'
import type { LogsConfiguration } from '../domain/configuration'
import { validateAndBuildLogsConfiguration } from '../domain/configuration'

import type { LogsMessage } from '../domain/logger'
import { StatusType, HandlerType } from '../domain/logger'
import type { LogsSessionManager } from '../domain/logsSessionManager'
import type { Sender } from '../domain/sender'
import { createSender } from '../domain/sender'
import { doStartLogs, startLogs as originalStartLogs } from './startLogs'

interface SentMessage extends LogsMessage {
  logger?: { name: string }
  view: {
    id?: string
    referrer?: string
    url: string
  }
}

function getLoggedMessage(server: sinon.SinonFakeServer, index: number) {
  return JSON.parse(server.requests[index].requestBody) as SentMessage
}
const FAKE_DATE = 123456
const SESSION_ID = 'session-id'

interface Rum {
  getInternalContext(startTime?: number): any | undefined
}
declare global {
  interface Window {
    DD_RUM?: Rum
  }
}

const DEFAULT_MESSAGE = { status: StatusType.info, message: 'message' }

describe('logs', () => {
  const initConfiguration = { clientToken: 'xxx', service: 'service' }
  let baseConfiguration: LogsConfiguration
  let sessionIsTracked: boolean
  let server: sinon.SinonFakeServer
  let rawErrorObservable: Observable<RawError>
  let reportObservable: Observable<RawReport>
  let consoleObservable: Observable<ConsoleLog>
  let consoleLogSpy: jasmine.Spy
  const sessionManager: LogsSessionManager = {
    findTrackedSession: () => (sessionIsTracked ? { id: SESSION_ID } : undefined),
  }
  let stopLogs = noop
  const startLogs = ({
    sender = createSender(noop),
    configuration: configurationOverrides,
  }: { sender?: Sender; configuration?: Partial<LogsConfiguration> } = {}) => {
    const configuration = { ...baseConfiguration, ...configurationOverrides }
    const startLogs = doStartLogs(
      configuration,
      rawErrorObservable,
      consoleObservable,
      reportObservable,
      sessionManager,
      sender
    )
    stopLogs = startLogs.stop
    return startLogs.send
  }

  beforeEach(() => {
    baseConfiguration = {
      ...validateAndBuildLogsConfiguration(initConfiguration)!,
      logsEndpointBuilder: stubEndpointBuilder('https://localhost/v1/input/log'),
      maxBatchSize: 1,
    }
    sessionIsTracked = true
    rawErrorObservable = new Observable<RawError>()
    consoleObservable = new Observable<ConsoleLog>()
    reportObservable = new Observable<RawReport>()
    server = sinon.fakeServer.create()
    consoleLogSpy = spyOn(console, 'log').and.callFake(() => true)
  })

  afterEach(() => {
    server.restore()
    delete window.DD_RUM
    deleteEventBridgeStub()
    stopSessionManager()
    stopLogs()
  })

  describe('request', () => {
    it('should send the needed data', () => {
      const sendLog = startLogs()
      sendLog(
        { message: 'message', foo: 'bar', status: StatusType.warn },
        {
          date: FAKE_DATE,
          view: { referrer: document.referrer, url: window.location.href },
        }
      )

      expect(server.requests.length).toEqual(1)
      expect(server.requests[0].url).toContain(baseConfiguration.logsEndpointBuilder.build())
      expect(getLoggedMessage(server, 0)).toEqual({
        date: FAKE_DATE as TimeStamp,
        foo: 'bar',
        message: 'message',
        service: 'service',
        session_id: SESSION_ID,
        status: StatusType.warn,
        view: {
          referrer: document.referrer,
          url: window.location.href,
        },
      })
    })

    it('should include RUM context', () => {
      window.DD_RUM = {
        getInternalContext() {
          return { view: { url: 'http://from-rum-context.com', id: 'view-id' } }
        },
      }
      const sendLog = startLogs()
      sendLog(DEFAULT_MESSAGE, {})

      expect(getLoggedMessage(server, 0).view).toEqual({
        id: 'view-id',
        url: 'http://from-rum-context.com',
      })
    })

    it('should use the rum internal context related to the error time', () => {
      window.DD_RUM = {
        getInternalContext(startTime) {
          return {
            foo: startTime === 1234 ? 'b' : 'a',
          }
        },
      }
      let sendLogStrategy: (message: LogsMessage, currentContext: Context) => void = noop
      const sendLog = (message: LogsMessage) => {
        sendLogStrategy(message, {})
      }
      sendLogStrategy = startLogs({ sender: createSender(sendLog) })

      rawErrorObservable.notify({
        message: 'error!',
        source: ErrorSource.SOURCE,
        startClocks: { relative: 1234 as RelativeTime, timeStamp: getTimeStamp(1234 as RelativeTime) },
        type: 'Error',
      })

      expect(getLoggedMessage(server, 0).foo).toBe('b')
    })

    it('should all use the same batch', () => {
      const sendLog = startLogs({ configuration: { maxBatchSize: 3 } })
      sendLog(DEFAULT_MESSAGE, {})
      sendLog(DEFAULT_MESSAGE, {})
      sendLog(DEFAULT_MESSAGE, {})

      expect(server.requests.length).toEqual(1)
    })

    it('should send bridge event when bridge is present', () => {
      const sendSpy = spyOn(initEventBridgeStub(), 'send')

      const sendLog = startLogs()
      sendLog(DEFAULT_MESSAGE, {})

      expect(server.requests.length).toEqual(0)
      const [message] = sendSpy.calls.mostRecent().args
      const parsedMessage = JSON.parse(message)
      expect(parsedMessage).toEqual({
        eventType: 'log',
        event: jasmine.objectContaining({ message: 'message' }),
      })
    })

    it('should not print the log twice when console handler is enabled', () => {
      const sender = createSender(noop)
      const logErrorSpy = spyOn(sender, 'sendToHttp')
      const displaySpy = spyOn(display, 'log')

      consoleObservable = initConsoleObservable(['log'])
      startLogs({ sender })
      sender.setHandler([HandlerType.console])
      /* eslint-disable-next-line no-console */
      console.log('foo', 'bar')

      expect(logErrorSpy).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledTimes(1)
      expect(displaySpy).not.toHaveBeenCalled()

      resetExperimentalFeatures()
    })

    it('should send console logs when ff forward-logs is enabled', () => {
      const sender = createSender(noop)
      const logErrorSpy = spyOn(sender, 'sendToHttp')

      updateExperimentalFeatures(['forward-logs'])
      const { stop } = originalStartLogs(
        validateAndBuildLogsConfiguration({ ...initConfiguration, forwardConsoleLogs: ['log'] })!,
        sender
      )

      /* eslint-disable-next-line no-console */
      console.log('foo', 'bar')

      expect(logErrorSpy).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalled()

      resetExperimentalFeatures()
      stop()
    })

    it('should not send console logs when ff forward-logs is disabled', () => {
      const sender = createSender(noop)
      const logErrorSpy = spyOn(sender, 'sendToHttp')

      const { stop } = originalStartLogs(
        validateAndBuildLogsConfiguration({ ...initConfiguration, forwardConsoleLogs: ['log'] })!,
        sender
      )

      /* eslint-disable-next-line no-console */
      console.log('foo', 'bar')

      expect(logErrorSpy).not.toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalled()
      stop()
    })
  })

  describe('reports', () => {
    let sender: Sender
    let logErrorSpy: jasmine.Spy
    let reportingObserverStub: ReturnType<typeof stubReportingObserver>

    beforeEach(() => {
      sender = createSender(noop)
      logErrorSpy = spyOn(sender, 'sendToHttp')
      reportingObserverStub = stubReportingObserver()
    })

    afterEach(() => {
      reportingObserverStub.reset()
    })

    it('should send reports when ff forward-reports is enabled', () => {
      updateExperimentalFeatures(['forward-reports'])
      const { stop } = originalStartLogs(
        validateAndBuildLogsConfiguration({ ...initConfiguration, forwardReports: ['intervention'] })!,
        sender
      )

      reportingObserverStub.raiseReport('intervention')

      expect(logErrorSpy).toHaveBeenCalled()

      resetExperimentalFeatures()
      stop()
    })

    it('should not send reports when ff forward-reports is disabled', () => {
      const { stop } = originalStartLogs(
        validateAndBuildLogsConfiguration({ ...initConfiguration, forwardReports: ['intervention'] })!,
        sender
      )
      reportingObserverStub.raiseReport('intervention')

      expect(logErrorSpy).not.toHaveBeenCalled()
      stop()
    })

    it('should not send reports when forwardReports init option not specified', () => {
      const { stop } = originalStartLogs(validateAndBuildLogsConfiguration({ ...initConfiguration })!, sender)
      reportingObserverStub.raiseReport('intervention')

      expect(logErrorSpy).not.toHaveBeenCalled()
      stop()
    })

    it('should add the source file information to the message for non error reports', () => {
      updateExperimentalFeatures(['forward-reports'])
      const { stop } = originalStartLogs(
        validateAndBuildLogsConfiguration({ ...initConfiguration, forwardReports: ['deprecation'] })!,
        sender
      )

      reportingObserverStub.raiseReport('deprecation')

      expect(logErrorSpy).toHaveBeenCalledOnceWith(
        'deprecation: foo bar Found in http://foo.bar/index.js:20:10',
        undefined,
        'warn'
      )

      resetExperimentalFeatures()
      stop()
    })
  })

  describe('sampling', () => {
    it('should be applied when event bridge is present', () => {
      const sendSpy = spyOn(initEventBridgeStub(), 'send')

      let configuration = { ...baseConfiguration, sampleRate: 0 }
      let { send, stop } = originalStartLogs(configuration, createSender(noop))
      send(DEFAULT_MESSAGE, {})

      expect(sendSpy).not.toHaveBeenCalled()
      stop()

      configuration = { ...baseConfiguration, sampleRate: 100 }
      ;({ send, stop } = originalStartLogs(configuration, createSender(noop)))
      send(DEFAULT_MESSAGE, {})

      expect(sendSpy).toHaveBeenCalled()
      stop()
    })
  })

  describe('logger sessionManager', () => {
    let sendLog: (message: LogsMessage, context: Context) => void

    beforeEach(() => {
      sendLog = startLogs()
    })

    it('when tracked should enable disable logging', () => {
      sendLog(DEFAULT_MESSAGE, {})
      expect(server.requests.length).toEqual(1)
    })

    it('when not tracked should disable logging', () => {
      sessionIsTracked = false
      sendLog(DEFAULT_MESSAGE, {})
      expect(server.requests.length).toEqual(0)
    })

    it('when type change should enable/disable existing loggers', () => {
      sendLog(DEFAULT_MESSAGE, {})
      expect(server.requests.length).toEqual(1)

      sessionIsTracked = false
      sendLog(DEFAULT_MESSAGE, {})
      expect(server.requests.length).toEqual(1)

      sessionIsTracked = true
      sendLog(DEFAULT_MESSAGE, {})
      expect(server.requests.length).toEqual(2)
    })
  })

  describe('error collection', () => {
    it('should send log errors', () => {
      const sendLogSpy = jasmine.createSpy()
      startLogs({ sender: createSender(sendLogSpy) })

      rawErrorObservable.notify({
        message: 'error!',
        source: ErrorSource.SOURCE,
        startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
        type: 'Error',
      })

      expect(sendLogSpy).toHaveBeenCalled()
      expect(sendLogSpy.calls.first().args).toEqual([
        {
          date: 123456789 as TimeStamp,
          error: { origin: ErrorSource.SOURCE, kind: 'Error', stack: undefined },
          message: 'error!',
          status: StatusType.error,
        },
      ])
    })
  })

  describe('logs limitation', () => {
    let clock: Clock
    const configuration = { eventRateLimiterThreshold: 1 }
    beforeEach(() => {
      clock = mockClock()
    })

    afterEach(() => {
      clock.cleanup()
    })
    ;[
      { status: StatusType.error, message: 'Reached max number of errors by minute: 1' },
      { status: StatusType.warn, message: 'Reached max number of warns by minute: 1' },
      { status: StatusType.info, message: 'Reached max number of infos by minute: 1' },
      { status: StatusType.debug, message: 'Reached max number of debugs by minute: 1' },
      { status: 'unknown' as StatusType, message: 'Reached max number of customs by minute: 1' },
    ].forEach(({ status, message }) => {
      it(`stops sending ${status} logs when reaching the limit`, () => {
        const sendLogSpy = jasmine.createSpy<(message: LogsMessage & { foo?: string }) => void>()
        const sendLog = startLogs({ sender: createSender(sendLogSpy), configuration })
        sendLog({ message: 'foo', status }, {})
        sendLog({ message: 'bar', status }, {})

        expect(server.requests.length).toEqual(1)
        expect(getLoggedMessage(server, 0).message).toBe('foo')
        expect(sendLogSpy).toHaveBeenCalledOnceWith({
          message,
          status: StatusType.error,
          error: {
            origin: ErrorSource.AGENT,
            kind: undefined,
            stack: undefined,
          },
          date: Date.now(),
        })
      })

      it(`does not take discarded ${status} logs into account`, () => {
        const sendLogSpy = jasmine.createSpy<(message: LogsMessage & { foo?: string }) => void>()
        const sendLog = startLogs({
          sender: createSender(sendLogSpy),
          configuration: {
            ...configuration,
            beforeSend(event) {
              if (event.message === 'discard me') {
                return false
              }
            },
          },
        })
        sendLog({ message: 'discard me', status }, {})
        sendLog({ message: 'discard me', status }, {})
        sendLog({ message: 'discard me', status }, {})
        sendLog({ message: 'foo', status }, {})

        expect(server.requests.length).toEqual(1)
        expect(getLoggedMessage(server, 0).message).toBe('foo')
        expect(sendLogSpy).not.toHaveBeenCalled()
      })

      it(`allows to send new ${status}s after a minute`, () => {
        const sendLog = startLogs({ configuration })
        sendLog({ message: 'foo', status }, {})
        sendLog({ message: 'bar', status }, {})
        clock.tick(ONE_MINUTE)
        sendLog({ message: 'baz', status }, {})

        expect(server.requests.length).toEqual(2)
        expect(getLoggedMessage(server, 0).message).toBe('foo')
        expect(getLoggedMessage(server, 1).message).toBe('baz')
      })

      it('allows to send logs with a different status when reaching the limit', () => {
        const otherLogStatus = status === StatusType.error ? 'other' : StatusType.error
        const sendLog = startLogs({ configuration })
        sendLog({ message: 'foo', status }, {})
        sendLog({ message: 'bar', status }, {})
        sendLog({ message: 'baz', status: otherLogStatus as StatusType }, {})

        expect(server.requests.length).toEqual(2)
        expect(getLoggedMessage(server, 0).message).toBe('foo')
        expect(getLoggedMessage(server, 1).message).toBe('baz')
      })
    })

    it('two different custom statuses are accounted by the same limit', () => {
      const sendLog = startLogs({ configuration })
      sendLog({ message: 'foo', status: 'foo' as StatusType }, {})
      sendLog({ message: 'bar', status: 'bar' as StatusType }, {})

      expect(server.requests.length).toEqual(1)
      expect(getLoggedMessage(server, 0).message).toBe('foo')
    })
  })
})
