import { expect, use } from 'chai'
import * as sinon from 'sinon'
import * as sinonChai from 'sinon-chai'

import { Configuration, DEFAULT_CONFIGURATION } from '../../core/configuration'
import { STATUSES, LogHandlerType, StatusType, startLogger } from '../logger'

use(sinonChai)

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
    startLogger(configuration as Configuration)
    server = sinon.fakeServer.create()
    clock = sinon.useFakeTimers(FAKE_DATE)
  })

  afterEach(() => {
    server.restore()
    clock.restore()
  })

  describe('request', () => {
    it('should send the needed data', () => {
      window.Datadog.logger.log('message', { foo: 'bar' }, 'warn')

      expect(server.requests.length).to.equal(1)
      expect(server.requests[0].url).to.equal(configuration.logsEndpoint)
      expect(JSON.parse(server.requests[0].requestBody)).to.deep.equal({
        date: FAKE_DATE,
        foo: 'bar',
        http: {
          url: window.location.href,
          useragent: navigator.userAgent,
        },
        message: 'message',
        status: 'warn',
      })
    })
  })

  describe('log method', () => {
    it("'logger.log' should have info status by default", () => {
      window.Datadog.logger.log('message')

      expect(JSON.parse(server.requests[0].requestBody).status).to.equal('info')
    })

    STATUSES.forEach((status) => {
      it(`'logger.${status}' should have ${status} status`, () => {
        ;(window.Datadog.logger as any)[status]('message')

        expect(JSON.parse(server.requests[0].requestBody).status).to.equal(status)
      })
    })
  })

  describe('global context', () => {
    it('should be added to the request', () => {
      window.Datadog.setLoggerGlobalContext({ bar: 'foo' })
      window.Datadog.logger.log('message')

      expect(JSON.parse(server.requests[0].requestBody).bar).to.equal('foo')
    })

    it('should be updatable', () => {
      window.Datadog.setLoggerGlobalContext({ bar: 'foo' })
      window.Datadog.logger.log('first')
      window.Datadog.setLoggerGlobalContext({ foo: 'bar' })
      window.Datadog.logger.log('second')

      expect(JSON.parse(server.requests[0].requestBody).bar).to.equal('foo')
      expect(JSON.parse(server.requests[1].requestBody).foo).to.equal('bar')
      expect(JSON.parse(server.requests[1].requestBody).bar).to.be.undefined
    })

    it('should be used by all loggers', () => {
      window.Datadog.setLoggerGlobalContext({ foo: 'bar' })
      const logger1 = window.Datadog.createLogger('1')
      const logger2 = window.Datadog.createLogger('2')

      logger1.debug('message')
      logger2.debug('message')

      expect(JSON.parse(server.requests[0].requestBody).foo).to.equal('bar')
      expect(JSON.parse(server.requests[1].requestBody).foo).to.equal('bar')
    })
  })

  describe('logger context', () => {
    it('should be added to the request', () => {
      window.Datadog.logger.setContext({ bar: 'foo' })
      window.Datadog.logger.log('message')

      expect(JSON.parse(server.requests[0].requestBody).bar).to.equal('foo')
    })

    it('should be updatable', () => {
      window.Datadog.logger.setContext({ bar: 'foo' })
      window.Datadog.logger.log('first')
      window.Datadog.logger.setContext({ foo: 'bar' })
      window.Datadog.logger.log('second')

      expect(JSON.parse(server.requests[0].requestBody).bar).to.equal('foo')
      expect(JSON.parse(server.requests[1].requestBody).foo).to.equal('bar')
      expect(JSON.parse(server.requests[1].requestBody).bar).to.be.undefined
    })
  })

  describe('log level', () => {
    it('should be debug by default', () => {
      window.Datadog.logger.debug('message')

      expect(server.requests.length).to.equal(1)
    })

    it('should be configurable', () => {
      window.Datadog.logger.setLevel(StatusType.info)

      window.Datadog.logger.debug('message')

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
      window.Datadog.logger.debug('message')

      expect(server.requests.length).to.equal(1)
      expect(consoleSpy).not.called
    })

    it('should be configurable to "console"', () => {
      window.Datadog.logger.setLogHandler(LogHandlerType.console)

      window.Datadog.logger.error('message')

      expect(server.requests.length).to.equal(0)
      expect(consoleSpy).calledWith('error: message')
    })

    it('should be configurable to "silent"', () => {
      window.Datadog.logger.setLogHandler(LogHandlerType.silent)

      window.Datadog.logger.error('message')

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
      const logger = window.Datadog.createLogger('foo')

      logger.debug('message')

      expect(server.requests.length).to.equal(1)
      expect(consoleSpy).not.called
    })

    it('should be configurable', () => {
      const logger = window.Datadog.createLogger('foo', {
        logHandler: LogHandlerType.console,
        level: StatusType.info,
      })

      logger.debug('ignored')
      logger.error('message')

      expect(server.requests.length).to.equal(0)
      expect(consoleSpy).calledWith('error: message')
    })

    it('could be initialized with a dedicated context', () => {
      const logger = window.Datadog.createLogger('context', {
        context: { foo: 'bar' },
      })

      logger.debug('message')

      expect(JSON.parse(server.requests[0].requestBody).foo).to.equal('bar')
    })

    it('should be retrievable', () => {
      const logger = window.Datadog.createLogger('foo')
      expect(window.Datadog.getLogger('foo')).to.equal(logger)
      expect(window.Datadog.getLogger('bar')).undefined
    })

    it('should all use the same batch', () => {
      const customConf = { ...configuration, maxBatchSize: 3 }
      startLogger(customConf as Configuration)

      const logger1 = window.Datadog.createLogger('1')
      const logger2 = window.Datadog.createLogger('2')

      window.Datadog.logger.debug('message from default')
      logger1.debug('message from logger1')
      logger2.debug('message from logger2')

      expect(server.requests.length).to.equal(1)
    })
  })
})
