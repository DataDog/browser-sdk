import { mockModule, unmockModules } from '../../../test/unit/mockModule'

import { Configuration, Context, DEFAULT_CONFIGURATION, ErrorMessage, noop, Observable } from '@datadog/browser-core'
import sinon from 'sinon'

import { Logger, LogsMessage, StatusType } from '../src/logger'
import { startLogs } from '../src/logs'

interface SentMessage extends LogsMessage {
  logger?: { name: string }
  view: {
    referrer: string
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

describe('logs', () => {
  let sessionIsTracked: boolean
  let configurationOverrides: Partial<Configuration>
  let server: sinon.SinonFakeServer

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
    mockModule('./packages/core/src/init.ts', () => ({
      commonInit() {
        return {
          configuration: { ...(configuration as Configuration), ...configurationOverrides },
          errorObservable: new Observable<ErrorMessage>(),
          internalMonitoring: { setExternalContextProvider: () => undefined },
        }
      },
    }))

    server = sinon.fakeServer.create()
  })

  afterEach(() => {
    server.restore()
    unmockModules()
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
})
