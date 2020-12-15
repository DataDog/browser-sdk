import {
  Configuration,
  Context,
  DEFAULT_CONFIGURATION,
  ErrorObservable,
  ErrorSource,
  noop,
  Observable,
  RawError,
} from '@datadog/browser-core'
import sinon from 'sinon'

import { Logger, LogsMessage, StatusType } from '../domain/logger'
import { LogsEventsFormat } from '../logsEventsFormat'
import { buildAssemble, doStartLogs } from './logs'

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
const baseConfiguration: Partial<Configuration> = {
  ...DEFAULT_CONFIGURATION,
  logsEndpoint: 'https://localhost/v1/input/log',
  maxBatchSize: 1,
  service: 'Service',
}
const internalMonitoring = { setExternalContextProvider: () => undefined }
const getGlobalContext = () => ({})

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
  let server: sinon.SinonFakeServer
  let errorObservable: ErrorObservable
  const session = {
    getId: () => (sessionIsTracked ? SESSION_ID : undefined),
    isTracked: () => sessionIsTracked,
  }
  const startLogs = ({
    errorLogger = new Logger(noop),
    configuration: configurationOverrides,
  }: { errorLogger?: Logger; configuration?: Partial<Configuration> } = {}) => {
    const configuration = { ...(baseConfiguration as Configuration), ...configurationOverrides }
    return doStartLogs(configuration, errorObservable, internalMonitoring, session, errorLogger, getGlobalContext)
  }

  beforeEach(() => {
    sessionIsTracked = true
    errorObservable = new Observable<RawError>()
    server = sinon.fakeServer.create()
  })

  afterEach(() => {
    server.restore()
    delete window.DD_RUM
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
      expect(server.requests[0].url).toEqual(baseConfiguration.logsEndpoint!)
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
      const sendLog = startLogs()
      sendLog(DEFAULT_MESSAGE, {})

      expect(getLoggedMessage(server, 0).view).toEqual({
        id: 'view-id',
        url: 'http://from-rum-context.com',
      })
    })

    it('should all use the same batch', () => {
      const sendLog = startLogs({ configuration: { maxBatchSize: 3 } })
      sendLog(DEFAULT_MESSAGE, {})
      sendLog(DEFAULT_MESSAGE, {})
      sendLog(DEFAULT_MESSAGE, {})

      expect(server.requests.length).toEqual(1)
    })
  })

  describe('assemble', () => {
    let assemble: (message: LogsMessage, currentContext: Context) => Context | undefined
    let beforeSend: (event: LogsEventsFormat) => void

    beforeEach(() => {
      beforeSend = noop
      assemble = buildAssemble(session, {
        ...(baseConfiguration as Configuration),
        beforeSend: (x: LogsEventsFormat) => beforeSend(x),
      })
      window.DD_RUM = {
        getInternalContext: noop,
      }
    })

    it('should not assemble when session is not tracked', () => {
      sessionIsTracked = false

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
        service: 'Service',
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

    it('should allow modification on sensitive field', () => {
      beforeSend = (event: LogsEventsFormat) => (event.message = 'modified')

      const assembledMessage = assemble(DEFAULT_MESSAGE, {})

      expect(assembledMessage!.message).toBe('modified')
    })

    it('should reject modification on non sensitive field', () => {
      beforeSend = (event: LogsEventsFormat) => ((event.service as any) = 'modified')

      const assembledMessage = assemble(DEFAULT_MESSAGE, {})

      expect(assembledMessage!.service).toBe('Service')
    })
  })

  describe('logger session', () => {
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

      errorObservable.notify({
        message: 'error!',
        source: ErrorSource.SOURCE,
        startTime: 1234,
        type: 'Error',
      })

      expect(sendLogSpy).toHaveBeenCalled()
      expect(sendLogSpy.calls.first().args).toEqual([
        {
          date: jasmine.any(Number),
          error: { origin: ErrorSource.SOURCE, kind: 'Error', stack: undefined },
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
      startLogs({ errorLogger: new Logger(sendLogSpy) })

      errorObservable.notify({
        message: 'error!',
        source: ErrorSource.SOURCE,
        startTime: 1234,
        type: 'Error',
      })

      expect(sendLogSpy).toHaveBeenCalled()
      expect(sendLogSpy.calls.argsFor(0)[0].foo).toBe('b')
    })
  })
})
