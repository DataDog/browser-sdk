import { expect } from 'chai'
import * as sinon from 'sinon'

import { Configuration, DEFAULT_CONFIGURATION } from '../configuration'
import { LOG_LEVELS, LogLevelEnum, startLogger } from '../logger'

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
    server = sinon.fakeServer.create()
    clock = sinon.useFakeTimers(FAKE_DATE)
  })

  afterEach(() => {
    server.restore()
    clock.restore()
  })

  describe('request', () => {
    beforeEach(() => {
      startLogger(configuration as Configuration)
    })

    it('should send the needed data', () => {
      window.Datadog.log('message', { foo: 'bar' }, 'warn')

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
    it("'log' should have info severity by default", () => {
      window.Datadog.log('message')

      expect(JSON.parse(server.requests[0].requestBody).severity).to.equal('info')
    })

    LOG_LEVELS.forEach((logLevel) => {
      it(`'${logLevel}' should have ${logLevel} severity`, () => {
        ;(window.Datadog as any)[logLevel]('message')

        expect(JSON.parse(server.requests[0].requestBody).severity).to.equal(logLevel)
      })
    })
  })

  describe('global context', () => {
    beforeEach(() => {
      startLogger(configuration as Configuration)
    })

    it('should be added to the request', () => {
      window.Datadog.setGlobalContext({ bar: 'foo' })
      window.Datadog.log('message')

      expect(JSON.parse(server.requests[0].requestBody).bar).to.equal('foo')
    })

    it('should be updatable', () => {
      window.Datadog.setGlobalContext({ bar: 'foo' })
      window.Datadog.log('first')
      window.Datadog.setGlobalContext({ foo: 'bar' })
      window.Datadog.log('second')

      expect(JSON.parse(server.requests[0].requestBody).bar).to.equal('foo')
      expect(JSON.parse(server.requests[1].requestBody).foo).to.equal('bar')
      expect(JSON.parse(server.requests[1].requestBody).bar).to.be.undefined
    })
  })

  describe('log level', () => {
    it('should be debug by default', () => {
      startLogger(configuration as Configuration)

      window.Datadog.debug('message')

      expect(server.requests.length).to.equal(1)
    })

    it('should be configurable', () => {
      const customConfiguration = { ...configuration, logLevel: LogLevelEnum.info }
      startLogger(customConfiguration as Configuration)

      window.Datadog.debug('message')

      expect(server.requests.length).to.equal(0)
    })
  })
})
