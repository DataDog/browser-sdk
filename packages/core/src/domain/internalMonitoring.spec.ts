import sinon from 'sinon'

import { Configuration } from './configuration'
import {
  InternalMonitoring,
  monitor,
  monitored,
  MonitoringMessage,
  resetInternalMonitoring,
  startInternalMonitoring,
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
      notMonitoredThrowing() {
        throw new Error('not monitored')
      }

      @monitored
      monitoredThrowing() {
        throw new Error('monitored')
      }

      @monitored
      monitoredStringErrorThrowing() {
        // tslint:disable-next-line: no-string-throw
        throw 'string error'
      }

      @monitored
      monitoredObjectErrorThrowing() {
        throw { foo: 'bar' }
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
      startInternalMonitoring(configuration as Configuration)
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
        monitor(() => {
          throw new Error('message')
        })()
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
      monitor(() => {
        throw new Error('message')
      })()
      expect((JSON.parse(server.requests[0].requestBody) as any).foo).toEqual('bar')

      internalMonitoring.setExternalContextProvider(() => ({}))
      monitor(() => {
        throw new Error('message')
      })()
      expect((JSON.parse(server.requests[1].requestBody) as any).foo).not.toBeDefined()
    })
  })
})
