import { mockModule, unmockModules } from '../../../test/unit/mockModule'

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
import { startLogs } from '../src/logs'

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

describe('logs', () => {
  let sessionIsTracked: boolean
  let configurationOverrides: Partial<Configuration>
  let server: sinon.SinonFakeServer
  let errorObservable: ErrorObservable

  beforeEach(() => {
    sessionIsTracked = true
    mockModule('./packages/logs/src/loggerSession.ts', () => ({
      startLoggerSession() {
        return {
          getId: () => (sessionIsTracked ? SESSION_ID : undefined),
          isTracked: () => sessionIsTracked,
        }
      },
    }))

    configurationOverrides = {}
    errorObservable = new Observable<ErrorMessage>()
    mockModule('./packages/core/src/init.ts', () => ({
      commonInit() {
        return {
          errorObservable,
          configuration: { ...(configuration as Configuration), ...configurationOverrides },
          internalMonitoring: { setExternalContextProvider: () => undefined },
        }
      },
    }))

    server = sinon.fakeServer.create()
  })

  afterEach(() => {
    server.restore()
    unmockModules()
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

    it('message context should take precedence over current context', () => {
      const sendLog = startLogs(DEFAULT_INIT_CONFIGURATION, new Logger(noop), () => ({}))
      sendLog(
        { message: 'message', status: StatusType.info, view: { url: 'http://from-message.com' } },
        { view: { url: 'http://from-current-context.com' } }
      )

      expect(getLoggedMessage(server, 0).view.url).toEqual('http://from-message.com')
    })

    it('should include RUM context', () => {
      window.DD_RUM = {
        getInternalContext() {
          return { view: { url: 'http://from-rum-context.com', id: 'view-id' } }
        },
      }
      const sendLog = startLogs(DEFAULT_INIT_CONFIGURATION, new Logger(noop), () => ({}))
      sendLog({ message: 'message', status: StatusType.info, view: { url: 'http://from-message.com' } }, {})

      expect(getLoggedMessage(server, 0).view).toEqual({
        id: 'view-id',
        url: 'http://from-message.com',
      })
    })

    it('should all use the same batch', () => {
      configurationOverrides = { maxBatchSize: 3 }
      const sendLog = startLogs(DEFAULT_INIT_CONFIGURATION, new Logger(noop), () => ({}))
      sendLog({ message: 'message', status: StatusType.info }, {})
      sendLog({ message: 'message', status: StatusType.info }, {})
      sendLog({ message: 'message', status: StatusType.info }, {})

      expect(server.requests.length).toEqual(1)
    })
  })

  describe('logger session', () => {
    let sendLog: (message: LogsMessage, context: Context) => void

    beforeEach(() => {
      sendLog = startLogs(DEFAULT_INIT_CONFIGURATION, new Logger(noop), () => ({}))
    })

    it('when tracked should enable disable logging', () => {
      sendLog({ message: 'message', status: StatusType.info }, {})
      expect(server.requests.length).toEqual(1)
    })

    it('when not tracked should disable logging', () => {
      sessionIsTracked = false
      sendLog({ message: 'message', status: StatusType.info }, {})
      expect(server.requests.length).toEqual(0)
    })

    it('when type change should enable/disable existing loggers', () => {
      sendLog({ message: 'message', status: StatusType.info }, {})
      expect(server.requests.length).toEqual(1)

      sessionIsTracked = false
      sendLog({ message: 'message', status: StatusType.info }, {})
      expect(server.requests.length).toEqual(1)

      sessionIsTracked = true
      sendLog({ message: 'message', status: StatusType.info }, {})
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
