import { vi, describe, expect, it, beforeEach, afterEach, type Mock } from 'vitest'
import { setDebugMode } from './util'
import type { Display } from './util'
import type { Monitor } from './monitor'
import { createMonitor } from './monitor'

describe('monitor', () => {
  let onMonitorErrorCollectedSpy: Mock<(error: unknown) => void>
  let displayErrorSpy: Mock
  let currentMonitor: Monitor

  function createFakeDisplay(): Display {
    displayErrorSpy = vi.fn()
    return {
      debug: vi.fn(),
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: displayErrorSpy,
    }
  }

  beforeEach(() => {
    onMonitorErrorCollectedSpy = vi.fn()
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

      expect(onMonitorErrorCollectedSpy).toHaveBeenCalledWith(new Error('monitored'))
    })

    it('should report string error', () => {
      candidate.monitoredStringErrorThrowing()

      expect(onMonitorErrorCollectedSpy).toHaveBeenCalledWith('string error')
    })

    it('should report object error', () => {
      candidate.monitoredObjectErrorThrowing()

      expect(onMonitorErrorCollectedSpy).toHaveBeenCalledWith({ foo: 'bar' })
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

        expect(onMonitorErrorCollectedSpy).toHaveBeenCalledWith(new Error('error'))
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

        expect(onMonitorErrorCollectedSpy).toHaveBeenCalledWith(new Error('error'))
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
      onMonitorErrorCollectedSpy.mockImplementation(() => {
        throw new Error('unexpected')
      })

      currentMonitor.callMonitored(() => {
        throw new Error('message')
      })

      expect(displayErrorSpy).toHaveBeenCalledWith('[MONITOR]', new Error('message'))
      expect(displayErrorSpy).toHaveBeenCalledWith('[MONITOR]', new Error('unexpected'))
    })
  })
})
