import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import { display } from './display'
import { callMonitored, monitor, monitored, startMonitorErrorCollection, setDebugMode } from './monitor'

describe('monitor', () => {
  let onMonitorErrorCollectedSpy: Mock<(error: unknown) => void>

  beforeEach(() => {
    onMonitorErrorCollectedSpy = vi.fn()
  })

  describe('decorator', () => {
    class Candidate {
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
        startMonitorErrorCollection(onMonitorErrorCollectedSpy)
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

        expect(onMonitorErrorCollectedSpy).toHaveBeenCalledTimes(1)
        expect(onMonitorErrorCollectedSpy).toHaveBeenCalledWith(new Error('monitored'))
      })

      it('should report string error', () => {
        candidate.monitoredStringErrorThrowing()

        expect(onMonitorErrorCollectedSpy).toHaveBeenCalledTimes(1)
        expect(onMonitorErrorCollectedSpy).toHaveBeenCalledWith('string error')
      })

      it('should report object error', () => {
        candidate.monitoredObjectErrorThrowing()

        expect(onMonitorErrorCollectedSpy).toHaveBeenCalledTimes(1)
        expect(onMonitorErrorCollectedSpy).toHaveBeenCalledWith({ foo: 'bar' })
      })
    })
  })

  describe('function', () => {
    const notThrowing = () => 1
    const throwing = () => {
      throw new Error('error')
    }

    beforeEach(() => {
      startMonitorErrorCollection(onMonitorErrorCollectedSpy)
    })

    describe('direct call', () => {
      it('should preserve original behavior', () => {
        expect(callMonitored(notThrowing)).toEqual(1)
      })

      it('should catch error', () => {
        expect(() => callMonitored(throwing)).not.toThrowError()
      })

      it('should report error', () => {
        callMonitored(throwing)

        expect(onMonitorErrorCollectedSpy).toHaveBeenCalledTimes(1)
        expect(onMonitorErrorCollectedSpy).toHaveBeenCalledWith(new Error('error'))
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
        monitor(throwing)()

        expect(onMonitorErrorCollectedSpy).toHaveBeenCalledTimes(1)
        expect(onMonitorErrorCollectedSpy).toHaveBeenCalledWith(new Error('error'))
      })
    })
  })

  describe('setDebugMode', () => {
    let displaySpy: Mock

    beforeEach(() => {
      displaySpy = vi.spyOn(display, 'error')
    })

    it('when not called, should not display error', () => {
      callMonitored(() => {
        throw new Error('message')
      })

      expect(displaySpy).not.toHaveBeenCalled()
    })

    it('when called, should display error', () => {
      setDebugMode(true)

      callMonitored(() => {
        throw new Error('message')
      })

      expect(displaySpy).toHaveBeenCalledTimes(1)
      expect(displaySpy).toHaveBeenCalledWith('[MONITOR]', new Error('message'))
    })

    it('displays errors thrown by the onMonitorErrorCollected callback', () => {
      setDebugMode(true)
      onMonitorErrorCollectedSpy.mockImplementation(() => {
        throw new Error('unexpected')
      })
      startMonitorErrorCollection(onMonitorErrorCollectedSpy)

      callMonitored(() => {
        throw new Error('message')
      })
      expect(displaySpy).toHaveBeenCalledWith('[MONITOR]', new Error('message'))
      expect(displaySpy).toHaveBeenCalledWith('[MONITOR]', new Error('unexpected'))
    })
  })
})
