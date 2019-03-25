import { expect } from 'chai'
import * as sinon from 'sinon'

import { Configuration } from '../configuration'
import { LOG_LEVELS, Logger, startLogger } from '../logger'

describe('logger module', () => {
  const FAKE_DATE = 123456
  const configuration: Partial<Configuration> = {
    logsEndpoint: 'https://localhost/log',
    maxBatchSize: 1,
  }
  let server: sinon.SinonFakeServer
  let clock: sinon.SinonFakeTimers
  let logger: Logger

  beforeEach(() => {
    logger = startLogger(configuration as Configuration).logger
    server = sinon.fakeServer.create()
    clock = sinon.useFakeTimers(FAKE_DATE)
  })

  afterEach(() => {
    server.restore()
    clock.restore()
  })

  describe('request', () => {
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
        version: 'dev',
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

    it('log should count the number of error', () => {
      window.Datadog.error('error message')
      expect(logger.errorCount).to.equal(1)
    })
  })

  describe('global context', () => {
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
})
