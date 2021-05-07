import { Configuration } from '../domain/configuration'
import { Clock, mockClock } from '../../../core/test/specHelper'
import { RawError } from './error'
import { createErrorFilter, ErrorFilter } from './errorFilter'
import { RelativeTime, relativeToClocks, resetNavigationStart } from './timeUtils'
import { noop, ONE_MINUTE } from './utils'

const CONFIGURATION = { maxErrorsByMinute: 1 } as Configuration

describe('errorFilter.isLimitReached', () => {
  let errorFilter: ErrorFilter | undefined
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    resetNavigationStart()
  })

  afterEach(() => {
    clock.cleanup()
  })

  it('returns false if the limit is not reached', () => {
    errorFilter = createErrorFilter(CONFIGURATION, noop)

    expect(errorFilter.isLimitReached()).toBe(false)
  })

  it('returns true if the limit is reached', () => {
    errorFilter = createErrorFilter(CONFIGURATION, noop)

    errorFilter.isLimitReached()
    expect(errorFilter.isLimitReached()).toBe(true)
  })

  it('returns false again when one minute is passed after the first counted error', () => {
    errorFilter = createErrorFilter(CONFIGURATION, noop)

    errorFilter.isLimitReached()
    errorFilter.isLimitReached()
    clock.tick(ONE_MINUTE)
    expect(errorFilter.isLimitReached()).toBe(false)
  })

  it('calls the "onLimitReached" callback with the raw "limit reached" error when the limit is reached', () => {
    const onLimitReachedSpy = jasmine.createSpy<(rawError: RawError) => void>()
    errorFilter = createErrorFilter(CONFIGURATION, onLimitReachedSpy)

    errorFilter.isLimitReached()
    errorFilter.isLimitReached()
    expect(onLimitReachedSpy).toHaveBeenCalledOnceWith({
      message: 'Reached max number of errors by minute: 1',
      source: 'agent',
      startClocks: relativeToClocks(0 as RelativeTime),
    })
  })

  // eslint-disable-next-line max-len
  it('returns false when called from the "onLimitReached" callback to bypass the limit for the "limit reached" error', () => {
    errorFilter = createErrorFilter(CONFIGURATION, () => {
      expect(errorFilter!.isLimitReached()).toBe(false)
    })

    errorFilter.isLimitReached()
    errorFilter.isLimitReached()
  })

  it('does not call the "onLimitReached" callback more than once when the limit is reached', () => {
    const onLimitReachedSpy = jasmine.createSpy<(rawError: RawError) => void>()
    errorFilter = createErrorFilter(CONFIGURATION, onLimitReachedSpy)

    errorFilter.isLimitReached()
    errorFilter.isLimitReached()
    errorFilter.isLimitReached()
    errorFilter.isLimitReached()
    errorFilter.isLimitReached()
    expect(onLimitReachedSpy).toHaveBeenCalledTimes(1)
  })

  it('returns true after reaching the limit even if the "onLimitReached" callback throws', () => {
    errorFilter = createErrorFilter(CONFIGURATION, () => {
      throw new Error('oops')
    })

    errorFilter.isLimitReached()
    expect(() => errorFilter!.isLimitReached()).toThrow()
    expect(errorFilter.isLimitReached()).toBe(true)
    expect(errorFilter.isLimitReached()).toBe(true)
  })

  // eslint-disable-next-line max-len
  it('returns true when the limit is reached and the "onLimitReached" callback does not call "isLimitReached" (ex: excluded by beforeSend)', () => {
    errorFilter = createErrorFilter(CONFIGURATION, () => {
      // do not call isLimitReached
    })

    errorFilter.isLimitReached()
    errorFilter.isLimitReached()
    expect(errorFilter.isLimitReached()).toBe(true)
  })

  it('returns false only once when called from the "onLimitReached" callback (edge case)', () => {
    errorFilter = createErrorFilter(CONFIGURATION, () => {
      expect(errorFilter!.isLimitReached()).toBe(false)
      expect(errorFilter!.isLimitReached()).toBe(true)
    })

    errorFilter.isLimitReached()
    errorFilter.isLimitReached()
  })
})
