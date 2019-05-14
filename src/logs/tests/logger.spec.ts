import { expect, use } from 'chai'
import * as sinon from 'sinon'
import * as sinonChai from 'sinon-chai'

import { Configuration, DEFAULT_CONFIGURATION } from '../../core/configuration'
import { ErrorMessage } from '../../core/errorCollection'
import { Observable } from '../../core/observable'
import { HandlerType, startLogger, STATUSES, StatusType } from '../logger'

use(sinonChai)

function getLoggedMessage(server: sinon.SinonFakeServer, index: number) {
  return JSON.parse(server.requests[index].requestBody)
}
const errorObservable = new Observable<ErrorMessage>()

describe('logger module', () => {
  const FAKE_DATE = 123456
  const configuration: Partial<Configuration> = {
    ...DEFAULT_CONFIGURATION,
    logsEndpoint: 'https://localhost/log',
    maxBatchSize: 1,
  }
  let server: sinon.SinonFakeServer
  let clock: sinon.SinonFakeTimers

  beforeEach(() => {
    startLogger(errorObservable, configuration as Configuration)
    server = sinon.fakeServer.create()
    clock = sinon.useFakeTimers(FAKE_DATE)
  })

  afterEach(() => {
    server.restore()
    clock.restore()
  })

  describe('request', () => {
    it('should send the needed data', () => {
      window.DD_LOGS.logger.log('message', { foo: 'bar' }, 'warn')

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
      window.DD_LOGS.logger.log('message')

      expect(getLoggedMessage(server, 0).status).to.equal('info')
    })

    STATUSES.forEach((status) => {
      it(`'logger.${status}' should have ${status} status`, () => {
        ;(window.DD_LOGS.logger as any)[status]('message')

        expect(getLoggedMessage(server, 0).status).to.equal(status)
      })
    })
  })

  describe('global context', () => {
    it('should be added to the request', () => {
      window.DD_LOGS.setLoggerGlobalContext({ bar: 'foo' })
      window.DD_LOGS.logger.log('message')

      expect(getLoggedMessage(server, 0).bar).to.equal('foo')
    })

    it('should be updatable', () => {
      window.DD_LOGS.setLoggerGlobalContext({ bar: 'foo' })
      window.DD_LOGS.logger.log('first')
      window.DD_LOGS.setLoggerGlobalContext({ foo: 'bar' })
      window.DD_LOGS.logger.log('second')

      expect(getLoggedMessage(server, 0).bar).to.equal('foo')
      expect(getLoggedMessage(server, 1).foo).to.equal('bar')
      expect(getLoggedMessage(server, 1).bar).to.be.undefined
    })

    it('should be used by all loggers', () => {
      window.DD_LOGS.setLoggerGlobalContext({ foo: 'bar' })
      const logger1 = window.DD_LOGS.createLogger('1')
      const logger2 = window.DD_LOGS.createLogger('2')

      logger1.debug('message')
      logger2.debug('message')

      expect(getLoggedMessage(server, 0).foo).to.equal('bar')
      expect(getLoggedMessage(server, 1).foo).to.equal('bar')
    })
  })

  describe('logger context', () => {
    it('should be added to the request', () => {
      window.DD_LOGS.logger.setContext({ bar: 'foo' })
      window.DD_LOGS.logger.log('message')

      expect(getLoggedMessage(server, 0).bar).to.equal('foo')
    })

    it('should be updatable', () => {
      window.DD_LOGS.logger.setContext({ bar: 'foo' })
      window.DD_LOGS.logger.log('first')
      window.DD_LOGS.logger.setContext({ foo: 'bar' })
      window.DD_LOGS.logger.log('second')

      expect(getLoggedMessage(server, 0).bar).to.equal('foo')
      expect(getLoggedMessage(server, 1).foo).to.equal('bar')
      expect(getLoggedMessage(server, 1).bar).to.be.undefined
    })
  })

  describe('log level', () => {
    it('should be debug by default', () => {
      window.DD_LOGS.logger.debug('message')

      expect(server.requests.length).to.equal(1)
    })

    it('should be configurable', () => {
      window.DD_LOGS.logger.setLevel(StatusType.info)

      window.DD_LOGS.logger.debug('message')

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
      window.DD_LOGS.logger.debug('message')

      expect(server.requests.length).to.equal(1)
      expect(consoleSpy).not.called
    })

    it('should be configurable to "console"', () => {
      window.DD_LOGS.logger.setHandler(HandlerType.console)

      window.DD_LOGS.logger.error('message')

      expect(server.requests.length).to.equal(0)
      expect(consoleSpy).calledWith('error: message')
    })

    it('should be configurable to "silent"', () => {
      window.DD_LOGS.logger.setHandler(HandlerType.silent)

      window.DD_LOGS.logger.error('message')

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
      const logger = window.DD_LOGS.createLogger('foo')

      logger.debug('message')

      expect(server.requests.length).to.equal(1)
      expect(consoleSpy).not.called
    })

    it('should be configurable', () => {
      const logger = window.DD_LOGS.createLogger('foo', {
        handler: HandlerType.console,
        level: StatusType.info,
      })

      logger.debug('ignored')
      logger.error('message')

      expect(server.requests.length).to.equal(0)
      expect(consoleSpy).calledWith('error: message')
    })

    it('should have their name in their context', () => {
      const logger = window.DD_LOGS.createLogger('foo')

      logger.debug('message')

      expect(getLoggedMessage(server, 0).logger.name).to.equal('foo')
    })

    it('could be initialized with a dedicated context', () => {
      const logger = window.DD_LOGS.createLogger('context', {
        context: { foo: 'bar' },
      })

      logger.debug('message')

      expect(getLoggedMessage(server, 0).foo).to.equal('bar')
    })

    it('should be retrievable', () => {
      const logger = window.DD_LOGS.createLogger('foo')
      expect(window.DD_LOGS.getLogger('foo')).to.equal(logger)
      expect(window.DD_LOGS.getLogger('bar')).undefined
    })

    it('should all use the same batch', () => {
      const customConf = { ...configuration, maxBatchSize: 3 }
      startLogger(errorObservable, customConf as Configuration)

      const logger1 = window.DD_LOGS.createLogger('1')
      const logger2 = window.DD_LOGS.createLogger('2')

      window.DD_LOGS.logger.debug('message from default')
      logger1.debug('message from logger1')
      logger2.debug('message from logger2')

      expect(server.requests.length).to.equal(1)
    })
  })
})
