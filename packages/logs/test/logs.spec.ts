import {
  Configuration,
  Context,
  DEFAULT_CONFIGURATION,
  ErrorMessage,
  ErrorObservable,
  ErrorOrigin,
  noop,
  Observable,
} from '@datadog/browser-core'
import sinon from 'sinon'

import { Logger, LogsMessage, StatusType } from '../src/logger'
import { assembleMessageContexts, makeStartLogs } from '../src/logs'

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
const DEFAULT_INIT_CONFIGURATION = { clientToken: 'xxx' }
const FAKE_DATE = 123456
const SESSION_ID = 'session-id'
const configuration: Partial<Configuration> = {
  ...DEFAULT_CONFIGURATION,
  logsEndpoint: 'https://localhost/v1/input/log',
  maxBatchSize: 1,
  service: 'Service',
}

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
  let sessionIsTracked: boolean
  let configurationOverrides: Partial<Configuration>
  let server: sinon.SinonFakeServer
  let errorObservable: ErrorObservable
  const startLogs = makeStartLogs(() => {
    return {
      errorObservable,
      configuration: { ...(configuration as Configuration), ...configurationOverrides },
      internalMonitoring: { setExternalContextProvider: () => undefined },
      session: {
        getId: () => (sessionIsTracked ? SESSION_ID : undefined),
        isTracked: () => sessionIsTracked,
      },
    }
  })

  beforeEach(() => {
    sessionIsTracked = true
    configurationOverrides = {}
    errorObservable = new Observable<ErrorMessage>()
    server = sinon.fakeServer.create()
  })

  afterEach(() => {
    server.restore()
    delete window.DD_RUM
  })

  describe('request', () => {
    it('should send the needed data', () => {
      const sendLog = startLogs(DEFAULT_INIT_CONFIGURATION, new Logger(noop), () => ({}))
      sendLog(
        { message: 'message', foo: 'bar', status: StatusType.warn },
        {
          date: FAKE_DATE,
          view: { referrer: document.referrer, url: window.location.href },
        }
      )

      expect(server.requests.length).toEqual(1)
      expect(server.requests[0].url).toEqual(configuration.logsEndpoint!)
      expect(getLoggedMessage(server, 0)).toEqual({
        date: FAKE_DATE,
        foo: 'bar',
        message: 'message',
        service: 'Service',
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
      const sendLog = startLogs(DEFAULT_INIT_CONFIGURATION, new Logger(noop), () => ({}))
      sendLog(DEFAULT_MESSAGE, {})

      expect(getLoggedMessage(server, 0).view).toEqual({
        id: 'view-id',
        url: 'http://from-rum-context.com',
      })
    })

    it('should all use the same batch', () => {
      configurationOverrides = { maxBatchSize: 3 }
      const sendLog = startLogs(DEFAULT_INIT_CONFIGURATION, new Logger(noop), () => ({}))
      sendLog(DEFAULT_MESSAGE, {})
      sendLog(DEFAULT_MESSAGE, {})
      sendLog(DEFAULT_MESSAGE, {})

      expect(server.requests.length).toEqual(1)
    })
  })

  describe('assembleMessageContexts', () => {
    it('assembles various contexts', () => {
      expect(
        assembleMessageContexts(
          { session_id: SESSION_ID, service: 'Service' },
          { foo: 'from-current-context' },
          { view: { url: 'http://from-rum-context.com', id: 'view-id' } },
          DEFAULT_MESSAGE
        )
      ).toEqual({
        foo: 'from-current-context',
        message: DEFAULT_MESSAGE.message,
        service: 'Service',
        session_id: SESSION_ID,
        status: DEFAULT_MESSAGE.status,
        view: { url: 'http://from-rum-context.com', id: 'view-id' },
      })
    })

    it('message context should take precedence over RUM context', () => {
      expect(
        assembleMessageContexts(
          {},
          { session_id: 'from-rum-context' },
          {},
          { ...DEFAULT_MESSAGE, session_id: 'from-message-context' }
        ).session_id
      ).toBe('from-message-context')
    })

    it('RUM context should take precedence over current context', () => {
      expect(
        assembleMessageContexts(
          {},
          { session_id: 'from-current-context' },
          { session_id: 'from-rum-context' },
          DEFAULT_MESSAGE
        ).session_id
      ).toBe('from-rum-context')
    })

    it('current context should take precedence over default context', () => {
      expect(
        assembleMessageContexts(
          { service: 'from-default-context' },
          { service: 'from-current-context' },
          undefined,
          DEFAULT_MESSAGE
        ).service
      ).toBe('from-current-context')
    })
  })

  describe('logger session', () => {
    let sendLog: (message: LogsMessage, context: Context) => void

    beforeEach(() => {
      sendLog = startLogs(DEFAULT_INIT_CONFIGURATION, new Logger(noop), () => ({}))
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
      const errorLogger = new Logger(sendLogSpy)
      startLogs(DEFAULT_INIT_CONFIGURATION, errorLogger, () => ({}))

      errorObservable.notify({
        context: { error: { origin: ErrorOrigin.SOURCE, kind: 'Error' } },
        message: 'error!',
        startTime: 1234,
      })

      expect(sendLogSpy).toHaveBeenCalled()
      expect(sendLogSpy.calls.first().args).toEqual([
        {
          date: jasmine.any(Number),
          error: { origin: ErrorOrigin.SOURCE, kind: 'Error' },
          message: 'error!',
          status: StatusType.error,
        },
      ])
    })

    it('should use the rum internal context related to the error time', () => {
      window.DD_RUM = {
        getInternalContext(startTime) {
          return {
            foo: startTime === 1234 ? 'b' : 'a',
          }
        },
      }
      const sendLogSpy = jasmine.createSpy<(message: LogsMessage & { foo?: string }) => void>()
      const errorLogger = new Logger(sendLogSpy)
      startLogs(DEFAULT_INIT_CONFIGURATION, errorLogger, () => ({}))

      errorObservable.notify({
        context: { error: { origin: ErrorOrigin.SOURCE, kind: 'Error' } },
        message: 'error!',
        startTime: 1234,
      })

      expect(sendLogSpy).toHaveBeenCalled()
      expect(sendLogSpy.calls.argsFor(0)[0].foo).toBe('b')
    })
  })
})
