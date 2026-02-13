import { vi } from 'vitest'
import { mockClock, mockZoneJs } from '../../test'
import type { Clock, MockZoneJs } from '../../test'
import { startMonitorErrorCollection } from './monitor'
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
      clock = mockClock()
      zoneJs = mockZoneJs()
    })

    it('executes the callback asynchronously', () => {
      const spy = vi.fn()
      setTimer(spy)
      expect(spy).not.toHaveBeenCalled()
      clock.tick(0)
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('schedules an asynchronous task', () => {
      const spy = vi.fn()
      setTimer(spy)
      expect(spy).not.toHaveBeenCalled()
      clock.tick(0)
      expect(spy).toHaveBeenCalledTimes(1)
    })

    it('does not use the Zone.js function', () => {
      const zoneJsSetTimerSpy = vi.fn()
      zoneJs.replaceProperty(window, name, zoneJsSetTimerSpy)

      setTimer(noop)
      clock.tick(0)

      expect(zoneJsSetTimerSpy).not.toHaveBeenCalled()
    })

    it('monitors the callback', () => {
      const onMonitorErrorCollectedSpy = vi.fn()
      startMonitorErrorCollection(onMonitorErrorCollectedSpy)

      setTimer(() => {
        throw new Error('foo')
      })
      clock.tick(0)

      expect(onMonitorErrorCollectedSpy).toHaveBeenCalledTimes(1)
      expect(onMonitorErrorCollectedSpy).toHaveBeenCalledWith(new Error('foo'))
    })

    it('can be canceled', () => {
      const spy = vi.fn()
      const timerId = setTimer(spy)
      clearTimer(timerId)
      clock.tick(0)
      expect(spy).not.toHaveBeenCalled()
    })
  })
})
