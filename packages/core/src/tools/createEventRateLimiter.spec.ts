import type { Clock } from '../../test/specHelper'
import { mockClock } from '../../test/specHelper'
import type { RawError } from './error'
import type { EventRateLimiter } from './createEventRateLimiter'
import { createEventRateLimiter } from './createEventRateLimiter'
import type { RelativeTime } from './timeUtils'
import { relativeToClocks, resetNavigationStart } from './timeUtils'
import { noop, ONE_MINUTE } from './utils'

describe('createEventRateLimiter', () => {
  let eventLimiter: EventRateLimiter | undefined
  let clock: Clock
  const limit = 1
  beforeEach(() => {
    clock = mockClock()
    resetNavigationStart()
  })

  afterEach(() => {
    clock.cleanup()
  })

  it('returns false if the limit is not reached', () => {
    eventLimiter = createEventRateLimiter('error', limit, noop)

    expect(eventLimiter.isLimitReached()).toBe(false)
  })

  it('returns true if the limit is reached', () => {
    eventLimiter = createEventRateLimiter('error', limit, noop)

    eventLimiter.isLimitReached()
    expect(eventLimiter.isLimitReached()).toBe(true)
  })

  it('returns false again when one minute is passed after the first counted error', () => {
    eventLimiter = createEventRateLimiter('error', limit, noop)

    eventLimiter.isLimitReached()
    eventLimiter.isLimitReached()
    clock.tick(ONE_MINUTE)
    expect(eventLimiter.isLimitReached()).toBe(false)
  })

  it('calls the "onLimitReached" callback with the raw "limit reached" error when the limit is reached', () => {
    const onLimitReachedSpy = jasmine.createSpy<(rawError: RawError) => void>()
    eventLimiter = createEventRateLimiter('error', limit, onLimitReachedSpy)

    eventLimiter.isLimitReached()
    eventLimiter.isLimitReached()
    expect(onLimitReachedSpy).toHaveBeenCalledOnceWith({
      message: 'Reached max number of errors by minute: 1',
      source: 'agent',
      startClocks: relativeToClocks(0 as RelativeTime),
    })
  })

  it('returns false when called from the "onLimitReached" callback to bypass the limit for the "limit reached" error', () => {
    eventLimiter = createEventRateLimiter('error', limit, () => {
      expect(eventLimiter!.isLimitReached()).toBe(false)
    })

    eventLimiter.isLimitReached()
    eventLimiter.isLimitReached()
  })

  it('does not call the "onLimitReached" callback more than once when the limit is reached', () => {
    const onLimitReachedSpy = jasmine.createSpy<(rawError: RawError) => void>()
    eventLimiter = createEventRateLimiter('error', limit, onLimitReachedSpy)

    eventLimiter.isLimitReached()
    eventLimiter.isLimitReached()
    eventLimiter.isLimitReached()
    eventLimiter.isLimitReached()
    eventLimiter.isLimitReached()
    expect(onLimitReachedSpy).toHaveBeenCalledTimes(1)
  })

  it('returns true after reaching the limit even if the "onLimitReached" callback throws', () => {
    eventLimiter = createEventRateLimiter('error', limit, () => {
      throw new Error('oops')
    })

    eventLimiter.isLimitReached()
    expect(() => eventLimiter!.isLimitReached()).toThrow()
    expect(eventLimiter.isLimitReached()).toBe(true)
    expect(eventLimiter.isLimitReached()).toBe(true)
  })

  it('returns true when the limit is reached and the "onLimitReached" callback does not call "isLimitReached" (ex: excluded by beforeSend)', () => {
    eventLimiter = createEventRateLimiter('error', limit, () => {
      // do not call isLimitReached
    })

    eventLimiter.isLimitReached()
    eventLimiter.isLimitReached()
    expect(eventLimiter.isLimitReached()).toBe(true)
  })

  it('returns false only once when called from the "onLimitReached" callback (edge case)', () => {
    eventLimiter = createEventRateLimiter('error', limit, () => {
      expect(eventLimiter!.isLimitReached()).toBe(false)
      expect(eventLimiter!.isLimitReached()).toBe(true)
    })

    eventLimiter.isLimitReached()
    eventLimiter.isLimitReached()
  })
})
