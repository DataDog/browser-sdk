import { Configuration } from '../domain/configuration'
import { mockClock } from '../../../core/test/specHelper'
import { RawError } from './error'
import { createErrorFilter, ErrorFilter } from './errorFilter'
import { RelativeTime, relativeToClocks, resetNavigationStart } from './timeUtils'
import { noop, ONE_MINUTE } from './utils'

const CONFIGURATION = { maxErrorsByMinute: 1 } as Configuration

describe('errorFilter', () => {
  let errorFilter: ErrorFilter | undefined
  let clock: jasmine.Clock
  let cleanupClock: () => void

  beforeEach(() => {
    ;({ clock, stop: cleanupClock } = mockClock())
    resetNavigationStart()
  })

  afterEach(() => {
    cleanupClock()
  })

  it('allows to send an error', () => {
    errorFilter = createErrorFilter(CONFIGURATION, noop)

    expect(errorFilter.isLimitReached()).toBe(false)
  })

  it('prevents from sending an error when the limit is reached', () => {
    errorFilter = createErrorFilter(CONFIGURATION, noop)

    errorFilter.isLimitReached()
    expect(errorFilter.isLimitReached()).toBe(true)
  })

  it('allows to send errors again once one minute have passed', () => {
    errorFilter = createErrorFilter(CONFIGURATION, noop)

    errorFilter.isLimitReached()
    errorFilter.isLimitReached()
    clock.tick(ONE_MINUTE)
    expect(errorFilter.isLimitReached()).toBe(false)
  })

  it('calls the "onLimitReached" callback with the raw "limit" error to send when the limit is reached', () => {
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

  it('allows to send the "limit" error when the limit is reached', () => {
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

  it('still works if the "onLimitReached" callback throws', () => {
    errorFilter = createErrorFilter(CONFIGURATION, () => {
      throw new Error('oops')
    })

    errorFilter.isLimitReached()
    expect(() => errorFilter!.isLimitReached()).toThrow()
    expect(errorFilter.isLimitReached()).toBe(true)
    expect(errorFilter.isLimitReached()).toBe(true)
  })

  it('filters error even if the "limit" error is not sent (ex: excluded by beforeSend)', () => {
    errorFilter = createErrorFilter(CONFIGURATION, () => {
      // do not send the error
    })

    errorFilter.isLimitReached()
    errorFilter.isLimitReached()
    expect(errorFilter.isLimitReached()).toBe(true)
  })

  it('allows a single error from being sent when the "onLimitReached" callback is called (edge case)', () => {
    errorFilter = createErrorFilter(CONFIGURATION, () => {
      expect(errorFilter!.isLimitReached()).toBe(false)
      expect(errorFilter!.isLimitReached()).toBe(true)
    })

    errorFilter.isLimitReached()
    errorFilter.isLimitReached()
  })
})
