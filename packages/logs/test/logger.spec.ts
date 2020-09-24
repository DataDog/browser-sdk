import { Configuration, DEFAULT_CONFIGURATION, ErrorMessage, Observable } from '@datadog/browser-core'
import sinon from 'sinon'

import { HandlerType, LogsMessage, STATUSES, StatusType } from '../src/logger'
import { LoggerSession } from '../src/loggerSession'
import { LogsGlobal, makeLogsGlobal } from '../src/logs.entry'

interface SentMessage extends LogsMessage {
  logger?: { name: string }
}

function getLoggedMessage(server: sinon.SinonFakeServer, index: number) {
  return JSON.parse(server.requests[index].requestBody) as SentMessage
}
const DEFAULT_INIT_CONFIGURATION = { clientToken: 'xxx' }

describe('logger module', () => {
  const TRACKED_SESSION = { getId: () => undefined, isTracked: () => true }
  const FAKE_DATE = 123456
  const configuration: Partial<Configuration> = {
    ...DEFAULT_CONFIGURATION,
    logsEndpoint: 'https://localhost/v1/input/log',
    maxBatchSize: 1,
    service: 'Service',
  }
  let LOGS: LogsGlobal
  let server: sinon.SinonFakeServer

  function makeLogsGlobalWithDefaults({
    session: overrideSession,
    configuration: overrideConfiguration,
  }: {
    session?: LoggerSession
    configuration?: Partial<Configuration>
  }) {
    return makeLogsGlobal(() => ({
      configuration: { ...(configuration as Configuration), ...overrideConfiguration },
      errorObservable: new Observable<ErrorMessage>(),
      internalMonitoring: { setExternalContextProvider: () => undefined },
      session: overrideSession || TRACKED_SESSION,
    }))
  }

  beforeEach(() => {
    LOGS = makeLogsGlobalWithDefaults({})
    LOGS.init(DEFAULT_INIT_CONFIGURATION)
    server = sinon.fakeServer.create()
    jasmine.clock().install()
    jasmine.clock().mockDate(new Date(FAKE_DATE))
  })

  afterEach(() => {
    server.restore()
    jasmine.clock().uninstall()
  })

  describe('log method', () => {
    it("'logger.log' should have info status by default", () => {
      LOGS.logger.log('message')

      expect(getLoggedMessage(server, 0).status).toEqual(StatusType.info)
    })

    STATUSES.forEach((status) => {
      it(`'logger.${status}' should have ${status} status`, () => {
        ;((LOGS.logger as any)[status] as any)('message')

        expect(getLoggedMessage(server, 0).status).toEqual(status)
      })
    })
  })

  describe('logger context', () => {
    it('should be added to the request', () => {
      LOGS.logger.setContext({ bar: 'foo' })
      LOGS.logger.log('message')

      expect(getLoggedMessage(server, 0).bar).toEqual('foo')
    })

    it('should be updatable', () => {
      LOGS.logger.setContext({ bar: 'foo' })
      LOGS.logger.log('first')
      LOGS.logger.setContext({ foo: 'bar' })
      LOGS.logger.log('second')

      expect(getLoggedMessage(server, 0).bar).toEqual('foo')
      expect(getLoggedMessage(server, 1).foo).toEqual('bar')
      expect(getLoggedMessage(server, 1).bar).toBeUndefined()
    })

    it('should be deep merged', () => {
      LOGS.setLoggerGlobalContext({ foo: { bar: 'qux' } })
      LOGS.logger.setContext({ foo: { qix: 'qux' } })
      LOGS.logger.log('message', { foo: { qux: 'qux' } })
      LOGS.logger.log('message', { foo: { hello: 'hi' } })

      expect(getLoggedMessage(server, 0).foo).toEqual({
        bar: 'qux',
        qix: 'qux',
        qux: 'qux',
      })
      expect(getLoggedMessage(server, 1).foo).toEqual({
        bar: 'qux',
        hello: 'hi',
        qix: 'qux',
      })
    })

    it('should be able to be able to add and remove from context', () => {
      LOGS.logger.setContext({})
      LOGS.logger.addContext('foo', { bar: 'qux' })
      LOGS.logger.log('first')
      LOGS.logger.removeContext('foo')
      LOGS.logger.log('second')
      expect(getLoggedMessage(server, 0).foo).toEqual({
        bar: 'qux',
      })
      expect(getLoggedMessage(server, 1).foo).toEqual(undefined)
    })
  })

  describe('log level', () => {
    it('should be debug by default', () => {
      LOGS.logger.debug('message')

      expect(server.requests.length).toEqual(1)
    })

    it('should be configurable', () => {
      LOGS.logger.setLevel(StatusType.info)

      LOGS.logger.debug('message')

      expect(server.requests.length).toEqual(0)
    })
  })

  describe('log handler type', () => {
    beforeEach(() => {
      spyOn(console, 'log')
    })

    it('should be "http" by default', () => {
      LOGS.logger.debug('message')

      expect(server.requests.length).toEqual(1)
      expect(console.log).not.toHaveBeenCalled()
    })

    it('should be configurable to "console"', () => {
      LOGS.logger.setHandler(HandlerType.console)

      LOGS.logger.error('message')

      expect(server.requests.length).toEqual(0)
      expect(console.log).toHaveBeenCalledWith('error: message')
    })

    it('should be configurable to "silent"', () => {
      LOGS.logger.setHandler(HandlerType.silent)

      LOGS.logger.error('message')

      expect(server.requests.length).toEqual(0)
      expect(console.log).not.toHaveBeenCalled()
    })
  })
})
