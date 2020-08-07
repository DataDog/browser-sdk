import {
  Configuration,
  DEFAULT_CONFIGURATION,
  ErrorMessage,
  InternalMonitoring,
  Observable,
  Omit,
} from '@datadog/browser-core'
import sinon from 'sinon'

import { HandlerType, LogsMessage, startLogger, STATUSES, StatusType } from '../src/logger'
import { LogsGlobal } from '../src/logs.entry'

interface SentMessage extends LogsMessage {
  logger?: { name: string }
}

function getLoggedMessage(server: sinon.SinonFakeServer, index: number) {
  return JSON.parse(server.requests[index].requestBody) as SentMessage
}
const errorObservable = new Observable<ErrorMessage>()
type LogsApi = Omit<LogsGlobal, 'init'>
const internalMonitoring: InternalMonitoring = {
  setExternalContextProvider: () => undefined,
}

describe('logger module', () => {
  const TRACKED_SESSION = { getId: () => undefined, isTracked: () => true }
  const FAKE_DATE = 123456
  const configuration: Partial<Configuration> = {
    ...DEFAULT_CONFIGURATION,
    logsEndpoint: 'https://localhost/log',
    maxBatchSize: 1,
  }
  let LOGS: LogsApi
  let server: sinon.SinonFakeServer

  beforeEach(() => {
    LOGS = startLogger(errorObservable, configuration as Configuration, TRACKED_SESSION, internalMonitoring) as LogsApi
    server = sinon.fakeServer.create()
    jasmine.clock().install()
    jasmine.clock().mockDate(new Date(FAKE_DATE))
  })

  afterEach(() => {
    server.restore()
    jasmine.clock().uninstall()
  })

  describe('request', () => {
    it('should send the needed data', () => {
      LOGS.logger.log('message', { foo: 'bar' }, 'warn')

      expect(server.requests.length).toEqual(1)
      expect(server.requests[0].url).toEqual(configuration.logsEndpoint!)
      expect(getLoggedMessage(server, 0)).toEqual({
        date: FAKE_DATE,
        foo: 'bar',
        message: 'message',
        status: StatusType.warn,
        view: {
          referrer: document.referrer,
          url: window.location.href,
        },
      })
    })
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

  describe('global context', () => {
    it('should be added to the request', () => {
      LOGS.setLoggerGlobalContext({ bar: 'foo' })
      LOGS.logger.log('message')

      expect(getLoggedMessage(server, 0).bar).toEqual('foo')
    })

    it('should be updatable', () => {
      LOGS.setLoggerGlobalContext({ bar: 'foo' })
      LOGS.logger.log('first')
      LOGS.setLoggerGlobalContext({ foo: 'bar' })
      LOGS.logger.log('second')

      expect(getLoggedMessage(server, 0).bar).toEqual('foo')
      expect(getLoggedMessage(server, 1).foo).toEqual('bar')
      expect(getLoggedMessage(server, 1).bar).toBeUndefined()
    })

    it('should be used by all loggers', () => {
      LOGS.setLoggerGlobalContext({ foo: 'bar' })
      const logger1 = LOGS.createLogger('1')
      const logger2 = LOGS.createLogger('2')

      logger1.debug('message')
      logger2.debug('message')

      expect(getLoggedMessage(server, 0).foo).toEqual('bar')
      expect(getLoggedMessage(server, 1).foo).toEqual('bar')
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
      LOGS.logger.setContext({});
      LOGS.logger.addContext('foo', { bar: 'qux' });
      LOGS.logger.log('first')
      LOGS.logger.removeContext('foo');
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

  describe('custom loggers', () => {
    beforeEach(() => {
      spyOn(console, 'log')
    })

    it('should have a default configuration', () => {
      const logger = LOGS.createLogger('foo')

      logger.debug('message')

      expect(server.requests.length).toEqual(1)
      expect(console.log).not.toHaveBeenCalled()
    })

    it('should be configurable', () => {
      const logger = LOGS.createLogger('foo', {
        handler: HandlerType.console,
        level: StatusType.info,
      })

      logger.debug('ignored')
      logger.error('message')

      expect(server.requests.length).toEqual(0)
      expect(console.log).toHaveBeenCalledWith('error: message')
    })

    it('should have their name in their context', () => {
      const logger = LOGS.createLogger('foo')

      logger.debug('message')

      expect(getLoggedMessage(server, 0).logger!.name).toEqual('foo')
    })

    it('could be initialized with a dedicated context', () => {
      const logger = LOGS.createLogger('context', {
        context: { foo: 'bar' },
      })

      logger.debug('message')

      expect(getLoggedMessage(server, 0).foo).toEqual('bar')
    })

    it('should be retrievable', () => {
      const logger = LOGS.createLogger('foo')
      expect(LOGS.getLogger('foo')).toEqual(logger)
      expect(LOGS.getLogger('bar')).toBeUndefined()
    })

    it('should all use the same batch', () => {
      const customConf = { ...configuration, maxBatchSize: 3 }
      LOGS = startLogger(errorObservable, customConf as Configuration, TRACKED_SESSION, internalMonitoring) as LogsApi

      const logger1 = LOGS.createLogger('1')
      const logger2 = LOGS.createLogger('2')

      LOGS.logger.debug('message from default')
      logger1.debug('message from logger1')
      logger2.debug('message from logger2')

      expect(server.requests.length).toEqual(1)
    })
  })

  describe('logger session', () => {
    it('when tracked should enable disable logging', () => {
      LOGS = startLogger(
        errorObservable,
        configuration as Configuration,
        TRACKED_SESSION,
        internalMonitoring
      ) as LogsApi

      LOGS.logger.log('message')
      expect(server.requests.length).toEqual(1)
    })

    it('when not tracked should disable logging', () => {
      const notTrackedSession = {
        getId: () => undefined,
        isTracked: () => false,
      }
      LOGS = startLogger(
        errorObservable,
        configuration as Configuration,
        notTrackedSession,
        internalMonitoring
      ) as LogsApi

      LOGS.logger.log('message')
      expect(server.requests.length).toEqual(0)
    })

    it('when type change should enable/disable existing loggers', () => {
      let isTracked = true
      const session = {
        getId: () => undefined,
        isTracked: () => isTracked,
      }
      LOGS = startLogger(errorObservable, configuration as Configuration, session, internalMonitoring) as LogsApi
      const testLogger = LOGS.createLogger('test')

      LOGS.logger.log('message')
      testLogger.log('message')
      expect(server.requests.length).toEqual(2)

      isTracked = false
      LOGS.logger.log('message')
      testLogger.log('message')
      expect(server.requests.length).toEqual(2)

      isTracked = true
      LOGS.logger.log('message')
      testLogger.log('message')
      expect(server.requests.length).toEqual(4)
    })
  })
})
