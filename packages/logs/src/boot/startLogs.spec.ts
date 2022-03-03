import type { ConsoleLog, Context, RawError, RelativeTime, TimeStamp } from '@datadog/browser-core'
import {
  ErrorSource,
  noop,
  Observable,
  ONE_MINUTE,
  resetExperimentalFeatures,
  updateExperimentalFeatures,
  getTimeStamp,
  stopSessionManager,
} from '@datadog/browser-core'
import sinon from 'sinon'
import type { Clock } from '../../../core/test/specHelper'
import {
  deleteEventBridgeStub,
  initEventBridgeStub,
  mockClock,
  stubEndpointBuilder,
} from '../../../core/test/specHelper'
import type { LogsConfiguration } from '../domain/configuration'
import { validateAndBuildLogsConfiguration } from '../domain/configuration'

import type { LogsMessage } from '../domain/logger'
import { Logger, StatusType } from '../domain/logger'
import type { LogsSessionManager } from '../domain/logsSessionManager'
import type { LogsEvent } from '../logsEvent.types'
import { buildAssemble, doStartLogs, startLogs as originalStartLogs } from './startLogs'

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
  let baseConfiguration: LogsConfiguration
  let sessionIsTracked: boolean
  let server: sinon.SinonFakeServer
  let rawErrorObservable: Observable<RawError>
  let consoleObservable: Observable<ConsoleLog>
  const sessionManager: LogsSessionManager = {
    findTrackedSession: () => (sessionIsTracked ? { id: SESSION_ID } : undefined),
  }
  const startLogs = ({
    errorLogger = new Logger(noop),
    configuration: configurationOverrides,
  }: { errorLogger?: Logger; configuration?: Partial<LogsConfiguration> } = {}) => {
    const configuration = { ...baseConfiguration, ...configurationOverrides }
    return doStartLogs(configuration, rawErrorObservable, consoleObservable, sessionManager, errorLogger)
  }

  beforeEach(() => {
    baseConfiguration = {
      ...validateAndBuildLogsConfiguration({ clientToken: 'xxx', service: 'service' })!,
      logsEndpointBuilder: stubEndpointBuilder('https://localhost/v1/input/log'),
      maxBatchSize: 1,
    }
    sessionIsTracked = true
    rawErrorObservable = new Observable<RawError>()
    consoleObservable = new Observable<ConsoleLog>()
    server = sinon.fakeServer.create()
  })

  afterEach(() => {
    server.restore()
    delete window.DD_RUM
    deleteEventBridgeStub()
    stopSessionManager()
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
      sendLogStrategy = startLogs({ errorLogger: new Logger(sendLog) })

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

    it('should send console logs', () => {
      const logger = new Logger(noop)
      const logErrorSpy = spyOn(logger, 'log')
      const consoleLogSpy = spyOn(console, 'log').and.callFake(() => true)

      updateExperimentalFeatures(['forward-logs'])
      originalStartLogs({ ...baseConfiguration, forwardConsoleLogs: ['log'] }, logger)

      /* eslint-disable-next-line no-console */
      console.log('foo', 'bar')

      expect(logErrorSpy).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalled()

      resetExperimentalFeatures()
    })
  })

  describe('sampling', () => {
    it('should be applied when event bridge is present', () => {
      const sendSpy = spyOn(initEventBridgeStub(), 'send')

      let configuration = { ...baseConfiguration, sampleRate: 0 }
      let sendLog = originalStartLogs(configuration, new Logger(noop))
      sendLog(DEFAULT_MESSAGE, {})

      expect(sendSpy).not.toHaveBeenCalled()

      configuration = { ...baseConfiguration, sampleRate: 100 }
      sendLog = originalStartLogs(configuration, new Logger(noop))
      sendLog(DEFAULT_MESSAGE, {})

      expect(sendSpy).toHaveBeenCalled()
    })
  })

  describe('assemble', () => {
    let assemble: (message: LogsMessage, currentContext: Context) => Context | undefined
    let beforeSend: (event: LogsEvent) => void | boolean

    beforeEach(() => {
      beforeSend = noop
      assemble = buildAssemble(
        sessionManager,
        {
          ...baseConfiguration,
          beforeSend: (x: LogsEvent) => beforeSend(x),
        },
        noop
      )
      window.DD_RUM = {
        getInternalContext: noop,
      }
    })

    it('should not assemble when sessionManager is not tracked', () => {
      sessionIsTracked = false

      expect(assemble(DEFAULT_MESSAGE, { foo: 'from-current-context' })).toBeUndefined()
    })

    it('should not assemble if beforeSend returned false', () => {
      beforeSend = () => false
      expect(assemble(DEFAULT_MESSAGE, { foo: 'from-current-context' })).toBeUndefined()
    })

    it('add default, current and RUM context to message', () => {
      spyOn(window.DD_RUM!, 'getInternalContext').and.returnValue({
        view: { url: 'http://from-rum-context.com', id: 'view-id' },
      })

      const assembledMessage = assemble(DEFAULT_MESSAGE, { foo: 'from-current-context' })

      expect(assembledMessage).toEqual({
        foo: 'from-current-context',
        message: DEFAULT_MESSAGE.message,
        service: 'service',
        session_id: SESSION_ID,
        status: DEFAULT_MESSAGE.status,
        view: { url: 'http://from-rum-context.com', id: 'view-id' },
      })
    })

    it('message context should take precedence over RUM context', () => {
      spyOn(window.DD_RUM!, 'getInternalContext').and.returnValue({ session_id: 'from-rum-context' })

      const assembledMessage = assemble({ ...DEFAULT_MESSAGE, session_id: 'from-message-context' }, {})

      expect(assembledMessage!.session_id).toBe('from-message-context')
    })

    it('RUM context should take precedence over current context', () => {
      spyOn(window.DD_RUM!, 'getInternalContext').and.returnValue({ session_id: 'from-rum-context' })

      const assembledMessage = assemble(DEFAULT_MESSAGE, { session_id: 'from-current-context' })

      expect(assembledMessage!.session_id).toBe('from-rum-context')
    })

    it('current context should take precedence over default context', () => {
      const assembledMessage = assemble(DEFAULT_MESSAGE, { service: 'from-current-context' })

      expect(assembledMessage!.service).toBe('from-current-context')
    })

    it('should allow modification of existing fields', () => {
      beforeSend = (event: LogsEvent) => {
        event.message = 'modified message'
        ;(event.service as any) = 'modified service'
      }

      const assembledMessage = assemble(DEFAULT_MESSAGE, {})

      expect(assembledMessage!.message).toBe('modified message')
      expect(assembledMessage!.service).toBe('modified service')
    })

    it('should allow adding new fields', () => {
      beforeSend = (event: LogsEvent) => {
        event.foo = 'bar'
      }

      const assembledMessage = assemble(DEFAULT_MESSAGE, {})

      expect(assembledMessage!.foo).toBe('bar')
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
      startLogs({ errorLogger: new Logger(sendLogSpy) })

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
        const sendLog = startLogs({ errorLogger: new Logger(sendLogSpy), configuration })
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
          errorLogger: new Logger(sendLogSpy),
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
