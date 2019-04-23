import { expect, use } from 'chai'
import * as sinon from 'sinon'
import * as sinonChai from 'sinon-chai'

import { Configuration, DEFAULT_CONFIGURATION } from '../configuration'
import { LOG_LEVELS, LogHandlerType, LogLevelType, startLogger } from '../logger'

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
        severity: 'warn',
      })
    })
  })

  describe('log method', () => {
    it("'logger.log' should have info severity by default", () => {
      window.Datadog.logger.log('message')

      expect(JSON.parse(server.requests[0].requestBody).severity).to.equal('info')
    })

    LOG_LEVELS.forEach((logLevel) => {
      it(`'logger.${logLevel}' should have ${logLevel} severity`, () => {
        ;(window.Datadog.logger as any)[logLevel]('message')

        expect(JSON.parse(server.requests[0].requestBody).severity).to.equal(logLevel)
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
      window.Datadog.logger.setLogLevel(LogLevelType.info)

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
})
