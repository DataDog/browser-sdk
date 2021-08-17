import { TimeStamp } from '@datadog/browser-core'
import { SLEEP_THRESHOLD, trackSleep, getSleepDuration, SLEEP_CHECK_DELAY } from './trackSleep'

describe('trackSleep', () => {
  let stopSleepTracking: () => void
  let setIntervalCallback: () => void
  let dateNowSpy: jasmine.Spy<typeof Date.now>

  beforeEach(() => {
    // Jasmine date mock doesn't work here because it keeps the time and timeouts exactly
    // synchronized, and we specifically want to detect when they drift away.
    dateNowSpy = spyOn(Date, 'now').and.returnValue(0)
    spyOn(window, 'setInterval').and.callFake((callback) => {
      setIntervalCallback = callback as () => void
      return 1
    })
    ;({ stop: stopSleepTracking } = trackSleep())
  })

  afterEach(() => {
    stopSleepTracking()
  })

  describe('getSleepDuration', () => {
    it('returns 0 if it was not previously sleeping', () => {
      tick(SLEEP_THRESHOLD - 1)
      expect(getSleepDuration()).toBe(0)
    })

    it('returns the sleep duration if it was previously sleeping', () => {
      tick(SLEEP_THRESHOLD)
      expect(getSleepDuration()).toBe(SLEEP_THRESHOLD)
    })

    it('returns 0 if it was not sleeping since a given timestamp', () => {
      tick(SLEEP_THRESHOLD)
      expect(getSleepDuration((SLEEP_THRESHOLD + 1) as TimeStamp)).toBe(0)
    })

    it('returns the sleep duration if it was sleeping since a given timestamp', () => {
      tick(SLEEP_THRESHOLD)
      expect(getSleepDuration(0 as TimeStamp)).toBe(SLEEP_THRESHOLD)
    })

    it('collects the sleep periods across time', () => {
      tick(SLEEP_CHECK_DELAY)
      setIntervalCallback()

      // Sleep now
      tick(SLEEP_THRESHOLD)
      setIntervalCallback()

      tick(SLEEP_CHECK_DELAY)
      setIntervalCallback()

      // Sleep now
      tick(SLEEP_THRESHOLD)
      setIntervalCallback()

      setIntervalCallback()
      tick(SLEEP_CHECK_DELAY)

      expect(getSleepDuration(SLEEP_CHECK_DELAY as TimeStamp)).toBe(SLEEP_THRESHOLD * 2)
    })
  })

  function tick(delay: number) {
    dateNowSpy.and.returnValue(dateNowSpy() + delay)
  }
})
