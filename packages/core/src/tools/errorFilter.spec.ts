import { Configuration } from '../domain/configuration'
import { mockClock } from '../../../core/test/specHelper'
import { RawError } from './error'
import { createErrorFilter, ErrorFilter } from './errorFilter'
import { RelativeTime, relativeToClocks, resetNavigationStart } from './timeUtils'
import { noop, ONE_MINUTE } from './utils'

const CONFIGURATION = { maxErrorsByMinute: 2 } as Configuration

fdescribe('errorFilter', () => {
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

    expect(errorFilter.shouldSendError()).toBe(true)
  })

  it('prevents from sending an error when the limit is reached', () => {
    errorFilter = createErrorFilter(CONFIGURATION, noop)

    errorFilter.shouldSendError()
    expect(errorFilter.shouldSendError()).toBe(false)
  })

  it('allows to send errors again once one minute have passed', () => {
    errorFilter = createErrorFilter(CONFIGURATION, noop)

    errorFilter.shouldSendError()
    errorFilter.shouldSendError()
    clock.tick(ONE_MINUTE)
    expect(errorFilter.shouldSendError()).toBe(true)
  })

  it('calls the "onLimitReached" callback with the raw "limit" error to send when the limit is reached', () => {
    const onLimitReachedSpy = jasmine.createSpy<(rawError: RawError) => void>()
    errorFilter = createErrorFilter(CONFIGURATION, onLimitReachedSpy)

    errorFilter.shouldSendError()
    errorFilter.shouldSendError()
    expect(onLimitReachedSpy).toHaveBeenCalledOnceWith({
      message: 'Reached max number of errors by minute: 2',
      source: 'agent',
      startClocks: relativeToClocks(0 as RelativeTime),
    })
  })

  it('allows to send the "limit" error when the limit is reached', () => {
    errorFilter = createErrorFilter(CONFIGURATION, () => {
      expect(errorFilter!.shouldSendError()).toBe(true)
    })

    errorFilter.shouldSendError()
    errorFilter.shouldSendError()
  })

  it('does not call the "onLimitReached" callback more than once when the limit is reached', () => {
    const onLimitReachedSpy = jasmine.createSpy<(rawError: RawError) => void>()
    errorFilter = createErrorFilter(CONFIGURATION, onLimitReachedSpy)

    errorFilter.shouldSendError()
    errorFilter.shouldSendError()
    errorFilter.shouldSendError()
    errorFilter.shouldSendError()
    errorFilter.shouldSendError()
    expect(onLimitReachedSpy).toHaveBeenCalledTimes(1)
  })

  it('still works if the "onLimitReached" callback throws', () => {
    errorFilter = createErrorFilter(CONFIGURATION, () => {
      throw new Error('oops')
    })

    errorFilter.shouldSendError()
    expect(() => errorFilter!.shouldSendError()).toThrow()
    expect(errorFilter.shouldSendError()).toBe(false)
    expect(errorFilter.shouldSendError()).toBe(false)
  })

  it('filters error even if the "limit" error is not sent (ex: excluded by beforeSend)', () => {
    errorFilter = createErrorFilter(CONFIGURATION, () => {
      // do not send the error
    })

    errorFilter.shouldSendError()
    errorFilter.shouldSendError()
    expect(errorFilter.shouldSendError()).toBe(false)
  })

  it('allows a single error from being sent when the "onLimitReached" callback is called (edge case)', () => {
    errorFilter = createErrorFilter(CONFIGURATION, () => {
      expect(errorFilter!.shouldSendError()).toBe(true)
      expect(errorFilter!.shouldSendError()).toBe(false)
    })

    errorFilter.shouldSendError()
    errorFilter.shouldSendError()
  })
})
