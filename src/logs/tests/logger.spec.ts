import { expect, use } from 'chai'
import * as sinon from 'sinon'
import sinonChai from 'sinon-chai'

import { Configuration, DEFAULT_CONFIGURATION } from '../../core/configuration'
import { ErrorMessage } from '../../core/errorCollection'
import { Observable } from '../../core/observable'
import { HandlerType, LogsMessage, startLogger, STATUSES, StatusType } from '../logger'
import { LogsGlobal } from '../logs.entry'

use(sinonChai)

interface SentMessage extends LogsMessage {
  logger: { name: string }
}

function getLoggedMessage(server: sinon.SinonFakeServer, index: number) {
  return JSON.parse(server.requests[index].requestBody) as SentMessage
}
const errorObservable = new Observable<ErrorMessage>()
type LogsApi = Omit<LogsGlobal, 'init'>

describe('logger module', () => {
  const FAKE_DATE = 123456
  const configuration: Partial<Configuration> = {
    ...DEFAULT_CONFIGURATION,
    logsEndpoint: 'https://localhost/log',
    maxBatchSize: 1,
  }
  let LOGS: LogsApi
  let server: sinon.SinonFakeServer
  let clock: sinon.SinonFakeTimers

  beforeEach(() => {
    LOGS = startLogger(errorObservable, configuration as Configuration) as LogsApi
    server = sinon.fakeServer.create()
    clock = sinon.useFakeTimers(FAKE_DATE)
  })

  afterEach(() => {
    server.restore()
    clock.restore()
  })

  describe('request', () => {
    it('should send the needed data', () => {
      LOGS.logger.log('message', { foo: 'bar' }, 'warn')

      expect(server.requests.length).equal(1)
      expect(server.requests[0].url).equal(configuration.logsEndpoint)
      expect(getLoggedMessage(server, 0)).deep.equal({
        date: FAKE_DATE,
        foo: 'bar',
        http: {
          referer: window.location.href,
        },
        message: 'message',
        status: 'warn',
      })
    })
  })

  describe('log method', () => {
    it("'logger.log' should have info status by default", () => {
      LOGS.logger.log('message')

      expect(getLoggedMessage(server, 0).status).equal('info')
    })

    STATUSES.forEach((status) => {
      it(`'logger.${status}' should have ${status} status`, () => {
        ;((LOGS.logger as any)[status] as any)('message')

        expect(getLoggedMessage(server, 0).status).equal(status)
      })
    })
  })

  describe('global context', () => {
    it('should be added to the request', () => {
      LOGS.setLoggerGlobalContext({ bar: 'foo' })
      LOGS.logger.log('message')

      expect(getLoggedMessage(server, 0).bar).equal('foo')
    })

    it('should be updatable', () => {
      LOGS.setLoggerGlobalContext({ bar: 'foo' })
      LOGS.logger.log('first')
      LOGS.setLoggerGlobalContext({ foo: 'bar' })
      LOGS.logger.log('second')

      expect(getLoggedMessage(server, 0).bar).equal('foo')
      expect(getLoggedMessage(server, 1).foo).equal('bar')
      expect(getLoggedMessage(server, 1).bar).undefined
    })

    it('should be used by all loggers', () => {
      LOGS.setLoggerGlobalContext({ foo: 'bar' })
      const logger1 = LOGS.createLogger('1')
      const logger2 = LOGS.createLogger('2')

      logger1.debug('message')
      logger2.debug('message')

      expect(getLoggedMessage(server, 0).foo).equal('bar')
      expect(getLoggedMessage(server, 1).foo).equal('bar')
    })
  })

  describe('logger context', () => {
    it('should be added to the request', () => {
      LOGS.logger.setContext({ bar: 'foo' })
      LOGS.logger.log('message')

      expect(getLoggedMessage(server, 0).bar).equal('foo')
    })

    it('should be updatable', () => {
      LOGS.logger.setContext({ bar: 'foo' })
      LOGS.logger.log('first')
      LOGS.logger.setContext({ foo: 'bar' })
      LOGS.logger.log('second')

      expect(getLoggedMessage(server, 0).bar).equal('foo')
      expect(getLoggedMessage(server, 1).foo).equal('bar')
      expect(getLoggedMessage(server, 1).bar).undefined
    })

    it('should be deep merged', () => {
      LOGS.setLoggerGlobalContext({ foo: { bar: 'qux' } })
      LOGS.logger.setContext({ foo: { qix: 'qux' } })
      LOGS.logger.log('message', { foo: { qux: 'qux' } })
      LOGS.logger.log('message', { foo: { hello: 'hi' } })

      expect(getLoggedMessage(server, 0).foo).deep.equal({
        bar: 'qux',
        qix: 'qux',
        qux: 'qux',
      })
      expect(getLoggedMessage(server, 1).foo).deep.equal({
        bar: 'qux',
        hello: 'hi',
        qix: 'qux',
      })
    })
  })

  describe('log level', () => {
    it('should be debug by default', () => {
      LOGS.logger.debug('message')

      expect(server.requests.length).equal(1)
    })

    it('should be configurable', () => {
      LOGS.logger.setLevel(StatusType.info)

      LOGS.logger.debug('message')

      expect(server.requests.length).equal(0)
    })
  })

  describe('log handler type', () => {
    let consoleSpy: sinon.SinonSpy

    beforeEach(() => {
      consoleSpy = sinon.stub(console, 'log')
    })

    afterEach(() => {
      consoleSpy.restore()
    })

    it('should be "http" by default', () => {
      LOGS.logger.debug('message')

      expect(server.requests.length).equal(1)
      expect(consoleSpy).not.called
    })

    it('should be configurable to "console"', () => {
      LOGS.logger.setHandler(HandlerType.console)

      LOGS.logger.error('message')

      expect(server.requests.length).equal(0)
      expect(consoleSpy).calledWith('error: message')
    })

    it('should be configurable to "silent"', () => {
      LOGS.logger.setHandler(HandlerType.silent)

      LOGS.logger.error('message')

      expect(server.requests.length).equal(0)
      expect(consoleSpy).not.called
    })
  })

  describe('custom loggers', () => {
    let consoleSpy: sinon.SinonSpy

    beforeEach(() => {
      consoleSpy = sinon.stub(console, 'log')
    })

    afterEach(() => {
      consoleSpy.restore()
    })

    it('should have a default configuration', () => {
      const logger = LOGS.createLogger('foo')

      logger.debug('message')

      expect(server.requests.length).equal(1)
      expect(consoleSpy).not.called
    })

    it('should be configurable', () => {
      const logger = LOGS.createLogger('foo', {
        handler: HandlerType.console,
        level: StatusType.info,
      })

      logger.debug('ignored')
      logger.error('message')

      expect(server.requests.length).equal(0)
      expect(consoleSpy).calledWith('error: message')
    })

    it('should have their name in their context', () => {
      const logger = LOGS.createLogger('foo')

      logger.debug('message')

      expect(getLoggedMessage(server, 0).logger.name).equal('foo')
    })

    it('could be initialized with a dedicated context', () => {
      const logger = LOGS.createLogger('context', {
        context: { foo: 'bar' },
      })

      logger.debug('message')

      expect(getLoggedMessage(server, 0).foo).equal('bar')
    })

    it('should be retrievable', () => {
      const logger = LOGS.createLogger('foo')
      expect(LOGS.getLogger('foo')).equal(logger)
      expect(LOGS.getLogger('bar')).undefined
    })

    it('should all use the same batch', () => {
      const customConf = { ...configuration, maxBatchSize: 3 }
      LOGS = startLogger(errorObservable, customConf as Configuration) as LogsApi

      const logger1 = LOGS.createLogger('1')
      const logger2 = LOGS.createLogger('2')

      LOGS.logger.debug('message from default')
      logger1.debug('message from logger1')
      logger2.debug('message from logger2')

      expect(server.requests.length).equal(1)
    })
  })
})
