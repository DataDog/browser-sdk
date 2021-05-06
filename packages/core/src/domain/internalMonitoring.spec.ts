import sinon from 'sinon'
import { Clock, mockClock } from '../../test/specHelper'

import { Configuration } from './configuration'
import {
  InternalMonitoring,
  monitor,
  monitored,
  MonitoringMessage,
  resetInternalMonitoring,
  startInternalMonitoring,
  callMonitored,
} from './internalMonitoring'

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
      @monitored
      monitoredThrowing() {
        throw new Error('monitored')
      }

      @monitored
      monitoredStringErrorThrowing() {
        // eslint-disable-next-line no-throw-literal
        throw 'string error'
      }

      @monitored
      monitoredObjectErrorThrowing() {
        // eslint-disable-next-line no-throw-literal
        throw { foo: 'bar' }
      }

      @monitored
      monitoredNotThrowing() {
        return 1
      }

      notMonitoredThrowing() {
        throw new Error('not monitored')
      }
    }

    let candidate: Candidate
    beforeEach(() => {
      candidate = new Candidate()
    })

    describe('before initialization', () => {
      it('should not monitor', () => {
        expect(() => candidate.notMonitoredThrowing()).toThrowError('not monitored')
        expect(() => candidate.monitoredThrowing()).toThrowError('monitored')
        expect(candidate.monitoredNotThrowing()).toEqual(1)
      })
    })

    describe('after initialization', () => {
      beforeEach(() => {
        startInternalMonitoring(configuration as Configuration)
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

        const message = JSON.parse(server.requests[0].requestBody) as MonitoringMessage
        expect(message.message).toEqual('monitored')
        expect(message.error!.stack).toMatch('monitored')
        server.restore()
      })

      it('should report string error', () => {
        const server = sinon.fakeServer.create()

        candidate.monitoredStringErrorThrowing()

        const message = JSON.parse(server.requests[0].requestBody) as MonitoringMessage
        expect(message.message).toEqual('Uncaught "string error"')
        expect(message.error!.stack).toMatch('Not an instance of error')
        server.restore()
      })

      it('should report object error', () => {
        const server = sinon.fakeServer.create()

        candidate.monitoredObjectErrorThrowing()

        const message = JSON.parse(server.requests[0].requestBody) as MonitoringMessage
        expect(message.message).toEqual('Uncaught {"foo":"bar"}')
        expect(message.error!.stack).toMatch('Not an instance of error')
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
      startInternalMonitoring(configuration as Configuration)
    })

    afterEach(() => {
      resetInternalMonitoring()
    })

    describe('direct call', () => {
      it('should preserve original behavior', () => {
        expect(callMonitored(notThrowing)).toEqual(1)
      })

      it('should catch error', () => {
        expect(() => callMonitored(throwing)).not.toThrowError()
      })

      it('should report error', () => {
        const server = sinon.fakeServer.create()

        callMonitored(throwing)

        expect((JSON.parse(server.requests[0].requestBody) as MonitoringMessage).message).toEqual('error')
        server.restore()
      })
    })

    describe('wrapper', () => {
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
  })

  describe('request', () => {
    const FAKE_DATE = 123456
    let server: sinon.SinonFakeServer
    let clock: Clock

    beforeEach(() => {
      startInternalMonitoring(configuration as Configuration)
      server = sinon.fakeServer.create()
      clock = mockClock(new Date(FAKE_DATE))
    })

    afterEach(() => {
      resetInternalMonitoring()
      server.restore()
      clock.cleanup()
    })

    it('should send the needed data', () => {
      callMonitored(() => {
        throw new Error('message')
      })

      expect(server.requests.length).toEqual(1)
      expect(server.requests[0].url).toEqual(configuration.internalMonitoringEndpoint!)

      expect(JSON.parse(server.requests[0].requestBody)).toEqual({
        date: FAKE_DATE,
        error: jasmine.anything(),
        message: 'message',
        status: 'error',
        view: {
          referrer: document.referrer,
          url: window.location.href,
        },
      })
    })

    it('should cap the data sent', () => {
      const max = configuration.maxInternalMonitoringMessagesPerPage!
      for (let i = 0; i < max + 3; i += 1) {
        callMonitored(() => {
          throw new Error('message')
        })
      }

      expect(server.requests.length).toEqual(max)
    })
  })

  describe('external context', () => {
    let server: sinon.SinonFakeServer
    let internalMonitoring: InternalMonitoring

    beforeEach(() => {
      internalMonitoring = startInternalMonitoring(configuration as Configuration)
      server = sinon.fakeServer.create()
    })

    afterEach(() => {
      resetInternalMonitoring()
      server.restore()
    })

    it('should be added to error messages', () => {
      internalMonitoring.setExternalContextProvider(() => ({
        foo: 'bar',
      }))
      callMonitored(() => {
        throw new Error('message')
      })
      expect(JSON.parse(server.requests[0].requestBody).foo).toEqual('bar')

      internalMonitoring.setExternalContextProvider(() => ({}))
      callMonitored(() => {
        throw new Error('message')
      })
      expect(JSON.parse(server.requests[1].requestBody).foo).not.toBeDefined()
    })
  })
})
