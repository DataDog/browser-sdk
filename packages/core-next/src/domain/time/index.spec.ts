import {
  ONE_DAY,
  ONE_HOUR,
  ONE_MINUTE,
  ONE_SECOND,
  ONE_YEAR,
  addDuration,
  elapsed,
  looksLikeRelativeTime,
  toServerDuration,
} from '.'
import type { Duration, RelativeTime, ServerDuration, TimeStamp } from '.'

describe('time utilities', () => {
  describe('constants', () => {
    it('should define time constants correctly', () => {
      expect(ONE_SECOND).toBe(1000)
      expect(ONE_MINUTE).toBe(60 * 1000)
      expect(ONE_HOUR).toBe(60 * 60 * 1000)
      expect(ONE_DAY).toBe(24 * 60 * 60 * 1000)
      expect(ONE_YEAR).toBe(365 * 24 * 60 * 60 * 1000)
    })
  })

  describe('elapsed', () => {
    it('should return the difference between two timestamps', () => {
      const result = elapsed(100 as TimeStamp, 250 as TimeStamp)
      expect(result).toBe(150 as Duration)
    })

    it('should return the difference between two relative times', () => {
      const result = elapsed(10 as RelativeTime, 30 as RelativeTime)
      expect(result).toBe(20 as Duration)
    })
  })

  describe('addDuration', () => {
    it('should add a duration to a timestamp', () => {
      const result = addDuration(100 as TimeStamp, 50 as Duration)
      expect(result).toBe(150 as TimeStamp)
    })

    it('should add a duration to a relative time', () => {
      const result = addDuration(10 as RelativeTime, 5 as Duration)
      expect(result).toBe(15 as RelativeTime)
    })

    it('should add two durations', () => {
      const result = addDuration(10 as Duration, 20 as Duration)
      expect(result).toBe(30 as Duration)
    })
  })

  describe('toServerDuration', () => {
    it('should convert milliseconds to nanoseconds', () => {
      const result = toServerDuration(1 as Duration)
      expect(result).toBe(1_000_000 as ServerDuration)
    })

    it('should round the result', () => {
      const result = toServerDuration(1.5555 as Duration)
      expect(result).toBe(1_555_500 as ServerDuration)
    })

    it('should return undefined for undefined input', () => {
      const result = toServerDuration(undefined as unknown as Duration)
      expect(result).toBeUndefined()
    })
  })

  describe('looksLikeRelativeTime', () => {
    it('should return true for values below ONE_YEAR', () => {
      expect(looksLikeRelativeTime(0 as RelativeTime)).toBe(true)
      expect(looksLikeRelativeTime((ONE_YEAR - 1) as RelativeTime)).toBe(true)
    })

    it('should return false for values at or above ONE_YEAR', () => {
      expect(looksLikeRelativeTime(ONE_YEAR as TimeStamp)).toBe(false)
      expect(looksLikeRelativeTime(Date.now() as TimeStamp)).toBe(false)
    })
  })
})
