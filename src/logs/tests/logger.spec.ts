import { expect, use } from 'chai'
import * as sinon from 'sinon'
import * as sinonChai from 'sinon-chai'

import { Configuration, DEFAULT_CONFIGURATION } from '../../core/configuration'
import { ErrorMessage } from '../../core/errorCollection'
import { Observable } from '../../core/observable'
import { Omit } from '../../core/utils'
import { HandlerType, startLogger, STATUSES, StatusType } from '../logger'
import { LogsGlobal } from '../logs.entry'

use(sinonChai)

function getLoggedMessage(server: sinon.SinonFakeServer, index: number) {
  return JSON.parse(server.requests[index].requestBody)
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

      expect(server.requests.length).to.equal(1)
      expect(server.requests[0].url).to.equal(configuration.logsEndpoint)
      expect(getLoggedMessage(server, 0)).to.deep.equal({
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

      expect(getLoggedMessage(server, 0).status).to.equal('info')
    })

    STATUSES.forEach((status) => {
      it(`'logger.${status}' should have ${status} status`, () => {
        ;(LOGS.logger as any)[status]('message')

        expect(getLoggedMessage(server, 0).status).to.equal(status)
      })
    })
  })

  describe('global context', () => {
    it('should be added to the request', () => {
      LOGS.setLoggerGlobalContext({ bar: 'foo' })
      LOGS.logger.log('message')

      expect(getLoggedMessage(server, 0).bar).to.equal('foo')
    })

    it('should be updatable', () => {
      LOGS.setLoggerGlobalContext({ bar: 'foo' })
      LOGS.logger.log('first')
      LOGS.setLoggerGlobalContext({ foo: 'bar' })
      LOGS.logger.log('second')

      expect(getLoggedMessage(server, 0).bar).to.equal('foo')
      expect(getLoggedMessage(server, 1).foo).to.equal('bar')
      expect(getLoggedMessage(server, 1).bar).to.be.undefined
    })

    it('should be used by all loggers', () => {
      LOGS.setLoggerGlobalContext({ foo: 'bar' })
      const logger1 = LOGS.createLogger('1')
      const logger2 = LOGS.createLogger('2')

      logger1.debug('message')
      logger2.debug('message')

      expect(getLoggedMessage(server, 0).foo).to.equal('bar')
      expect(getLoggedMessage(server, 1).foo).to.equal('bar')
    })
  })

  describe('logger context', () => {
    it('should be added to the request', () => {
      LOGS.logger.setContext({ bar: 'foo' })
      LOGS.logger.log('message')

      expect(getLoggedMessage(server, 0).bar).to.equal('foo')
    })

    it('should be updatable', () => {
      LOGS.logger.setContext({ bar: 'foo' })
      LOGS.logger.log('first')
      LOGS.logger.setContext({ foo: 'bar' })
      LOGS.logger.log('second')

      expect(getLoggedMessage(server, 0).bar).to.equal('foo')
      expect(getLoggedMessage(server, 1).foo).to.equal('bar')
      expect(getLoggedMessage(server, 1).bar).to.be.undefined
    })
  })

  describe('log level', () => {
    it('should be debug by default', () => {
      LOGS.logger.debug('message')

      expect(server.requests.length).to.equal(1)
    })

    it('should be configurable', () => {
      LOGS.logger.setLevel(StatusType.info)

      LOGS.logger.debug('message')

      expect(server.requests.length).to.equal(0)
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

      expect(server.requests.length).to.equal(1)
      expect(consoleSpy).not.called
    })

    it('should be configurable to "console"', () => {
      LOGS.logger.setHandler(HandlerType.console)

      LOGS.logger.error('message')

      expect(server.requests.length).to.equal(0)
      expect(consoleSpy).calledWith('error: message')
    })

    it('should be configurable to "silent"', () => {
      LOGS.logger.setHandler(HandlerType.silent)

      LOGS.logger.error('message')

      expect(server.requests.length).to.equal(0)
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

      expect(server.requests.length).to.equal(1)
      expect(consoleSpy).not.called
    })

    it('should be configurable', () => {
      const logger = LOGS.createLogger('foo', {
        handler: HandlerType.console,
        level: StatusType.info,
      })

      logger.debug('ignored')
      logger.error('message')

      expect(server.requests.length).to.equal(0)
      expect(consoleSpy).calledWith('error: message')
    })

    it('should have their name in their context', () => {
      const logger = LOGS.createLogger('foo')

      logger.debug('message')

      expect(getLoggedMessage(server, 0).logger.name).to.equal('foo')
    })

    it('could be initialized with a dedicated context', () => {
      const logger = LOGS.createLogger('context', {
        context: { foo: 'bar' },
      })

      logger.debug('message')

      expect(getLoggedMessage(server, 0).foo).to.equal('bar')
    })

    it('should be retrievable', () => {
      const logger = LOGS.createLogger('foo')
      expect(LOGS.getLogger('foo')).to.equal(logger)
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

      expect(server.requests.length).to.equal(1)
    })
  })
})
