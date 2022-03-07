import { display } from './display'
import { callMonitored, monitor, startMonitorErrorCollection, resetMonitor, setDebugMode } from './monitor'

describe('monitor', () => {
  let onMonitorErrorCollectedSpy: jasmine.Spy<(error: unknown) => void>

  beforeEach(() => {
    onMonitorErrorCollectedSpy = jasmine.createSpy()
  })
  afterEach(() => {
    resetMonitor()
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

        expect(onMonitorErrorCollectedSpy).toHaveBeenCalledOnceWith(new Error('error'))
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

        expect(onMonitorErrorCollectedSpy).toHaveBeenCalledOnceWith(new Error('error'))
      })
    })
  })

  describe('setDebugMode', () => {
    let displaySpy: jasmine.Spy

    beforeEach(() => {
      displaySpy = spyOn(display, 'error')
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

      expect(displaySpy).toHaveBeenCalledOnceWith('[MONITOR]', new Error('message'))
    })

    it('displays errors thrown by the onMonitorErrorCollected callback', () => {
      setDebugMode(true)
      onMonitorErrorCollectedSpy.and.throwError(new Error('unexpected'))
      startMonitorErrorCollection(onMonitorErrorCollectedSpy)

      callMonitored(() => {
        throw new Error('message')
      })
      expect(displaySpy).toHaveBeenCalledWith('[MONITOR]', new Error('message'))
      expect(displaySpy).toHaveBeenCalledWith('[MONITOR]', new Error('unexpected'))
    })
  })
})
