import { expect, use } from 'chai'
import * as shallowDeepEqual from 'chai-shallow-deep-equal'
import * as sinon from 'sinon'
import { monitor, monitored, resetInternalMonitoring, startInternalMonitoring } from '../internalMonitoring'

use(shallowDeepEqual)

const configuration: any = {
  batchBytesLimit: 100,
  flushTimeout: 60 * 1000,
  internalMonitoringEndpoint: 'http://localhot/monitoring',
  maxBatchSize: 1,
  maxInternalMonitoringMessagesPerPage: 7,
}

describe('internal monitoring', () => {
  describe('decorator', () => {
    class Candidate {
      notMonitoredThrowing() {
        throw new Error('not monitored')
      }

      @monitored
      monitoredThrowing() {
        throw new Error('monitored')
      }

      @monitored
      monitoredNotThrowing() {
        return 1
      }
    }

    let candidate: Candidate
    beforeEach(() => {
      candidate = new Candidate()
    })

    describe('before initialisation', () => {
      it('should not monitor', () => {
        expect(() => candidate.notMonitoredThrowing()).to.throw('not monitored')
        expect(() => candidate.monitoredThrowing()).to.throw('monitored')
        expect(candidate.monitoredNotThrowing()).to.equal(1)
      })
    })

    describe('after initialisation', () => {
      beforeEach(() => {
        startInternalMonitoring(configuration)
      })

      afterEach(() => {
        resetInternalMonitoring()
      })

      it('should preserve original behavior', () => {
        expect(candidate.monitoredNotThrowing()).to.equal(1)
      })

      it('should catch error', () => {
        expect(() => candidate.notMonitoredThrowing()).to.throw()
        expect(() => candidate.monitoredThrowing()).to.not.throw()
      })

      it('should report error', () => {
        const server = sinon.fakeServer.create()

        candidate.monitoredThrowing()

        expect(JSON.parse(server.requests[0].requestBody).message).to.equal('monitored')
        server.restore()
      })
    })
  })

  describe('function', () => {
    const notThrowing = () => 1
    const throwing = () => {
      throw new Error('error')
    }

    beforeEach(() => {
      startInternalMonitoring(configuration)
    })

    afterEach(() => {
      resetInternalMonitoring()
    })

    it('should preserve original behavior', () => {
      const decorated = monitor(notThrowing)
      expect(decorated()).to.equal(1)
    })

    it('should catch error', () => {
      const decorated = monitor(throwing)
      expect(() => decorated()).to.not.throw()
    })

    it('should report error', () => {
      const server = sinon.fakeServer.create()

      monitor(throwing)()

      expect(JSON.parse(server.requests[0].requestBody).message).to.equal('error')
      server.restore()
    })
  })

  describe('request', () => {
    const FAKE_DATE = 123456
    let clock: sinon.SinonFakeTimers
    let server: sinon.SinonFakeServer

    beforeEach(() => {
      startInternalMonitoring(configuration)
      server = sinon.fakeServer.create()
      clock = sinon.useFakeTimers(FAKE_DATE)
    })

    afterEach(() => {
      resetInternalMonitoring()
      server.restore()
      clock.restore()
    })

    it('should send the needed data', () => {
      monitor(() => {
        throw new Error('message')
      })()

      expect(server.requests.length).to.equal(1)
      expect(server.requests[0].url).to.equal(configuration.internalMonitoringEndpoint)

      expect(JSON.parse(server.requests[0].requestBody)).to.shallowDeepEqual({
        date: FAKE_DATE,
        entry_type: 'internal',
        http: {
          referer: window.location.href,
        },
        message: 'message',
      })
    })

    it('should cap the data sent', () => {
      const max = configuration.maxInternalMonitoringMessagesPerPage
      for (let i = 0; i < max + 3; i += 1) {
        monitor(() => {
          throw new Error('message')
        })()
      }

      expect(server.requests.length).to.equal(max)
    })
  })
})
