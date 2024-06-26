import { mockClock, mockZoneJs, registerCleanupTask } from '../../test'
import type { Clock, MockZoneJs } from '../../test'
import { resetMonitor, startMonitorErrorCollection } from './monitor'
import { setTimeout, clearTimeout, setInterval, clearInterval } from './timer'
import { noop } from './utils/functionUtils'
;[
  {
    name: 'setTimeout' as const,
    setTimer: setTimeout,
    clearTimer: clearTimeout,
  },
  {
    name: 'setInterval' as const,
    setTimer: setInterval,
    clearTimer: clearInterval,
  },
].forEach(({ name, setTimer, clearTimer }) => {
  describe(name, () => {
    let clock: Clock
    let zoneJs: MockZoneJs

    beforeEach(() => {
      zoneJs = mockZoneJs()
      clock = mockClock()
      registerCleanupTask(() => {
        clock.cleanup()
      })
    })

    afterEach(() => {
      resetMonitor()
    })

    it('executes the callback asynchronously', () => {
      const spy = jasmine.createSpy()
      setTimer(spy)
      expect(spy).not.toHaveBeenCalled()
      clock.tick(0)
      expect(spy).toHaveBeenCalledOnceWith()
    })

    it('schedules an asynchronous task', () => {
      const spy = jasmine.createSpy()
      setTimer(spy)
      expect(spy).not.toHaveBeenCalled()
      clock.tick(0)
      expect(spy).toHaveBeenCalledOnceWith()
    })

    it('does not use the Zone.js function', () => {
      const zoneJsSetTimerSpy = jasmine.createSpy()
      zoneJs.replaceProperty(window, name, zoneJsSetTimerSpy)

      setTimer(noop)
      clock.tick(0)

      expect(zoneJsSetTimerSpy).not.toHaveBeenCalled()
    })

    it('monitors the callback', () => {
      const onMonitorErrorCollectedSpy = jasmine.createSpy()
      startMonitorErrorCollection(onMonitorErrorCollectedSpy)

      setTimer(() => {
        throw new Error('foo')
      })
      clock.tick(0)

      expect(onMonitorErrorCollectedSpy).toHaveBeenCalledOnceWith(new Error('foo'))
    })

    it('can be canceled', () => {
      const spy = jasmine.createSpy()
      const timerId = setTimer(spy)
      clearTimer(timerId)
      clock.tick(0)
      expect(spy).not.toHaveBeenCalled()
    })
  })
})
