import sinon from 'sinon'

import { Configuration } from '../configuration'
import {
  monitor,
  monitored,
  MonitoringMessage,
  resetInternalMonitoring,
  startInternalMonitoring,
} from '../internalMonitoring'

const configuration: Partial<Configuration> = {
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
        expect(() => candidate.notMonitoredThrowing()).toThrowError('not monitored')
        expect(() => candidate.monitoredThrowing()).toThrowError('monitored')
        expect(candidate.monitoredNotThrowing()).toEqual(1)
      })
    })

    describe('after initialisation', () => {
      beforeEach(() => {
        const session = { getId: () => undefined }
        startInternalMonitoring(configuration as Configuration, session)
      })

      afterEach(() => {
        resetInternalMonitoring()
      })

      it('should preserve original behavior', () => {
        expect(candidate.monitoredNotThrowing()).toEqual(1)
      })

      it('should catch error', () => {
        expect(() => candidate.notMonitoredThrowing()).toThrowError()
        expect(() => candidate.monitoredThrowing()).not.toThrowError()
      })

      it('should report error', () => {
        const server = sinon.fakeServer.create()

        candidate.monitoredThrowing()

        expect((JSON.parse(server.requests[0].requestBody) as MonitoringMessage).message).toEqual('monitored')
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
      const session = { getId: () => undefined }
      startInternalMonitoring(configuration as Configuration, session)
    })

    afterEach(() => {
      resetInternalMonitoring()
    })

    it('should preserve original behavior', () => {
      const decorated = monitor(notThrowing)
      expect(decorated()).toEqual(1)
    })

    it('should catch error', () => {
      const decorated = monitor(throwing)
      expect(() => decorated()).not.toThrowError()
    })

    it('should report error', () => {
      const server = sinon.fakeServer.create()

      monitor(throwing)()

      expect((JSON.parse(server.requests[0].requestBody) as MonitoringMessage).message).toEqual('error')
      server.restore()
    })
  })

  describe('request', () => {
    const FAKE_DATE = 123456
    let server: sinon.SinonFakeServer

    beforeEach(() => {
      const session = { getId: () => undefined }
      startInternalMonitoring(configuration as Configuration, session)
      server = sinon.fakeServer.create()
      jasmine.clock().install()
      jasmine.clock().mockDate(new Date(FAKE_DATE))
    })

    afterEach(() => {
      resetInternalMonitoring()
      server.restore()
      jasmine.clock().uninstall()
    })

    it('should send the needed data', () => {
      monitor(() => {
        throw new Error('message')
      })()

      expect(server.requests.length).toEqual(1)
      expect(server.requests[0].url).toEqual(configuration.internalMonitoringEndpoint!)

      expect(JSON.parse(server.requests[0].requestBody)).toEqual({
        date: FAKE_DATE,
        entry_type: 'internal',
        error: jasmine.anything(),
        http: {
          referer: window.location.href,
        },
        message: 'message',
        status: 'error',
      })
    })

    it('should cap the data sent', () => {
      const max = configuration.maxInternalMonitoringMessagesPerPage!
      for (let i = 0; i < max + 3; i += 1) {
        monitor(() => {
          throw new Error('message')
        })()
      }

      expect(server.requests.length).toEqual(max)
    })
  })
})
