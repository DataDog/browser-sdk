import type { Display } from './util'
import type { Monitor } from './monitor'
import { createMonitor } from './monitor'

describe('monitor', () => {
  let onMonitorErrorCollectedSpy: jasmine.Spy<(error: unknown) => void>
  let displayErrorSpy: jasmine.Spy
  let currentMonitor: Monitor

  function createFakeDisplay(): Display {
    displayErrorSpy = jasmine.createSpy('ifDebugEnabled.error')
    return {
      debug: jasmine.createSpy(),
      log: jasmine.createSpy(),
      info: jasmine.createSpy(),
      warn: jasmine.createSpy(),
      error: jasmine.createSpy(),
      ifDebugEnabled: {
        debug: jasmine.createSpy(),
        log: jasmine.createSpy(),
        info: jasmine.createSpy(),
        warn: jasmine.createSpy(),
        error: displayErrorSpy,
      },
    }
  }

  beforeEach(() => {
    onMonitorErrorCollectedSpy = jasmine.createSpy()
    currentMonitor = createMonitor(createFakeDisplay(), onMonitorErrorCollectedSpy)
  })

  describe('decorator', () => {
    interface CandidateApi {
      monitoredThrowing: () => void
      monitoredStringErrorThrowing: () => void
      monitoredObjectErrorThrowing: () => void
      monitoredNotThrowing: () => number
      notMonitoredThrowing: () => void
    }

    let candidate: CandidateApi

    beforeEach(() => {
      const { monitored } = currentMonitor

      class Candidate implements CandidateApi {
        @monitored
        monitoredThrowing() {
          throw new Error('monitored')
        }

        @monitored
        monitoredStringErrorThrowing() {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'string error'
        }

        @monitored
        monitoredObjectErrorThrowing() {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
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

      candidate = new Candidate()
    })

    it('should preserve original behavior', () => {
      expect(candidate.monitoredNotThrowing()).toEqual(1)
    })

    it('should catch error', () => {
      expect(() => candidate.notMonitoredThrowing()).toThrowError()
      expect(() => candidate.monitoredThrowing()).not.toThrowError()
    })

    it('should report error', () => {
      candidate.monitoredThrowing()

      expect(onMonitorErrorCollectedSpy).toHaveBeenCalledOnceWith(new Error('monitored'))
    })

    it('should report string error', () => {
      candidate.monitoredStringErrorThrowing()

      expect(onMonitorErrorCollectedSpy).toHaveBeenCalledOnceWith('string error')
    })

    it('should report object error', () => {
      candidate.monitoredObjectErrorThrowing()

      expect(onMonitorErrorCollectedSpy).toHaveBeenCalledOnceWith({ foo: 'bar' })
    })
  })

  describe('function', () => {
    const notThrowing = () => 1
    const throwing = () => {
      throw new Error('error')
    }

    describe('callMonitored', () => {
      it('should preserve original behavior', () => {
        expect(currentMonitor.callMonitored(notThrowing)).toEqual(1)
      })

      it('should catch error', () => {
        expect(() => currentMonitor.callMonitored(throwing)).not.toThrowError()
      })

      it('should report error', () => {
        currentMonitor.callMonitored(throwing)

        expect(onMonitorErrorCollectedSpy).toHaveBeenCalledOnceWith(new Error('error'))
      })
    })

    describe('monitor (wrapper)', () => {
      it('should preserve original behavior', () => {
        const decorated = currentMonitor.monitor(notThrowing)
        expect(decorated()).toEqual(1)
      })

      it('should catch error', () => {
        const decorated = currentMonitor.monitor(throwing)
        expect(() => decorated()).not.toThrowError()
      })

      it('should report error', () => {
        currentMonitor.monitor(throwing)()

        expect(onMonitorErrorCollectedSpy).toHaveBeenCalledOnceWith(new Error('error'))
      })
    })
  })

  describe('debug logging', () => {
    it('logs caught errors through the display debug-gated facet', () => {
      currentMonitor.callMonitored(() => {
        throw new Error('message')
      })

      expect(displayErrorSpy).toHaveBeenCalledWith('[MONITOR]', new Error('message'))
    })

    it('logs errors thrown by the onMonitorErrorCollected callback', () => {
      onMonitorErrorCollectedSpy.and.throwError(new Error('unexpected'))

      currentMonitor.callMonitored(() => {
        throw new Error('message')
      })

      expect(displayErrorSpy).toHaveBeenCalledWith('[MONITOR]', new Error('message'))
      expect(displayErrorSpy).toHaveBeenCalledWith('[MONITOR]', new Error('unexpected'))
    })
  })
})
