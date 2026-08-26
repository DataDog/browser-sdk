import { setDebugMode, getDebugMode } from './util'
import type { Display } from './util'
import type { Monitor } from './monitor'
import { createMonitor, startMonitorErrorCollection, stopMonitorErrorCollection, callMonitored } from './monitor'

describe('monitor', () => {
  let onMonitorErrorCollectedSpy: jasmine.Spy<(error: unknown) => void>
  let displayErrorSpy: jasmine.Spy
  let currentMonitor: Monitor

  function createFakeDisplay(): Display {
    displayErrorSpy = jasmine.createSpy('display.error')
    return {
      debug: jasmine.createSpy(),
      log: jasmine.createSpy(),
      info: jasmine.createSpy(),
      warn: jasmine.createSpy(),
      error: displayErrorSpy,
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
    afterEach(() => {
      setDebugMode(false)
    })

    it('does not log caught errors when debug mode is disabled', () => {
      currentMonitor.callMonitored(() => {
        throw new Error('message')
      })

      expect(displayErrorSpy).not.toHaveBeenCalled()
    })

    it('logs caught errors to the display when debug mode is enabled', () => {
      setDebugMode(true)

      currentMonitor.callMonitored(() => {
        throw new Error('message')
      })

      expect(displayErrorSpy).toHaveBeenCalledWith('[MONITOR]', new Error('message'))
    })

    it('logs errors thrown by the onMonitorErrorCollected callback when debug mode is enabled', () => {
      setDebugMode(true)
      onMonitorErrorCollectedSpy.and.throwError(new Error('unexpected'))

      currentMonitor.callMonitored(() => {
        throw new Error('message')
      })

      expect(displayErrorSpy).toHaveBeenCalledWith('[MONITOR]', new Error('message'))
      expect(displayErrorSpy).toHaveBeenCalledWith('[MONITOR]', new Error('unexpected'))
    })
  })
})

describe('global monitor', () => {
  let collectedErrors: unknown[]

  beforeEach(() => {
    stopMonitorErrorCollection()
    setDebugMode(false)
    collectedErrors = []
  })

  describe('startMonitorErrorCollection', () => {
    it('registers the callback and returns true on first call', () => {
      const result = startMonitorErrorCollection((e) => collectedErrors.push(e))

      expect(result).toBeTrue()

      callMonitored(() => {
        throw new Error('boom')
      })

      expect(collectedErrors).toEqual([new Error('boom')])
    })

    it('is first-wins: a second call is ignored and returns false', () => {
      const first = startMonitorErrorCollection((e) => collectedErrors.push(e))
      const second = startMonitorErrorCollection(() => {
        collectedErrors.push('should not be called')
      })

      expect(first).toBeTrue()
      expect(second).toBeFalse()

      callMonitored(() => {
        throw new Error('boom')
      })

      // the first callback still owns the sink; the second never ran
      expect(collectedErrors).toEqual([new Error('boom')])
    })
  })

  describe('stopMonitorErrorCollection', () => {
    it('clears the registered callback so monitored errors are dropped', () => {
      startMonitorErrorCollection((e) => collectedErrors.push(e))
      stopMonitorErrorCollection()

      callMonitored(() => {
        throw new Error('dropped')
      })

      expect(collectedErrors).toEqual([])
    })

    it('does not reset debug mode', () => {
      setDebugMode(true)
      startMonitorErrorCollection(() => {
        /* registered */
      })
      stopMonitorErrorCollection()

      expect(getDebugMode()).toBeTrue()
    })

    it('allows a new callback to be registered after stopping', () => {
      const first = startMonitorErrorCollection(() => {
        /* registered */
      })
      stopMonitorErrorCollection()
      const second = startMonitorErrorCollection((e) => collectedErrors.push(e))

      expect(first).toBeTrue()
      expect(second).toBeTrue()

      callMonitored(() => {
        throw new Error('after stop')
      })

      expect(collectedErrors).toEqual([new Error('after stop')])
    })
  })
})
