import { beforeEach, describe, expect, it, vi } from 'vitest'
import { startMonitorErrorCollection } from '../entries/monitor'
import { mockClock, mockZoneJs } from '../../../browser-core/test'
import type { Clock, MockZoneJs } from '../../../browser-core/test'
import { setTimeout, clearTimeout, setInterval, clearInterval } from './timer'
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
      expect(spy).toHaveBeenCalledExactlyOnceWith()
    })

    it('schedules an asynchronous task', () => {
      const spy = vi.fn()
      setTimer(spy)
      expect(spy).not.toHaveBeenCalled()
      clock.tick(0)
      expect(spy).toHaveBeenCalledExactlyOnceWith()
    })

    it('does not use the Zone.js function', () => {
      const zoneJsSetTimerSpy = vi.fn()
      zoneJs.replaceProperty(window, name, zoneJsSetTimerSpy)

      setTimer(() => {
        // ignore
      })
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

      expect(onMonitorErrorCollectedSpy).toHaveBeenCalledExactlyOnceWith(new Error('foo'))
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
