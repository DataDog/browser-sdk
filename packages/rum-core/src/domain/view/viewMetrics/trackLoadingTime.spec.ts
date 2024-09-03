import type { RelativeTime, Duration } from '@datadog/browser-core'
import { addDuration, clocksOrigin, Observable } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, setPageVisibility, restorePageVisibility } from '@datadog/browser-core/test'
import { ViewLoadingType } from '../../../rawRumEvent.types'
import { createPerformanceEntry } from '../../../../test'
import { PAGE_ACTIVITY_END_DELAY, PAGE_ACTIVITY_VALIDATION_DELAY } from '../../waitPageActivityEnd'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import { LifeCycle } from '../../lifeCycle'
import type { RumConfiguration } from '../../configuration'
import { trackLoadingTime } from './trackLoadingTime'

const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = (PAGE_ACTIVITY_VALIDATION_DELAY * 0.8) as Duration

const AFTER_PAGE_ACTIVITY_END_DELAY = PAGE_ACTIVITY_END_DELAY * 1.1

const LOAD_EVENT_BEFORE_ACTIVITY_TIMING = (BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY * 0.8) as RelativeTime

const LOAD_EVENT_AFTER_ACTIVITY_TIMING = (BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY * 1.2) as RelativeTime

describe('trackLoadingTime', () => {
  const lifeCycle = new LifeCycle()
  let clock: Clock
  let domMutationObservable: Observable<void>
  let loadingTimeCallback: jasmine.Spy<(loadingTime: Duration) => void>
  let setLoadEvent: (loadEvent: Duration) => void
  let stopLoadingTimeTracking: () => void

  function startLoadingTimeTracking(loadType: ViewLoadingType = ViewLoadingType.ROUTE_CHANGE) {
    const loadingTimeTracking = trackLoadingTime(
      lifeCycle,
      domMutationObservable,
      {} as RumConfiguration,
      loadType,
      clocksOrigin(),
      loadingTimeCallback
    )
    setLoadEvent = loadingTimeTracking.setLoadEvent
    stopLoadingTimeTracking = loadingTimeTracking.stop
  }

  beforeEach(() => {
    clock = mockClock()
    domMutationObservable = new Observable()
    loadingTimeCallback = jasmine.createSpy<(loadingTime: Duration) => void>()
  })

  afterEach(() => {
    stopLoadingTimeTracking()
    restorePageVisibility()
    clock.cleanup()
  })

  it('should have an undefined loading time if there is no activity on a route change', () => {
    startLoadingTimeTracking()
    expect(loadingTimeCallback).not.toHaveBeenCalled()
  })

  it('should have a loading time equal to the activity time if there is a unique activity on a route change', () => {
    startLoadingTimeTracking()

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    domMutationObservable.notify()
    clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)

    expect(loadingTimeCallback).toHaveBeenCalledOnceWith(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
  })

  it('should use loadEventEnd for initial view when having no activity', () => {
    const loadType = ViewLoadingType.INITIAL_LOAD
    startLoadingTimeTracking(loadType)

    const entry = createPerformanceEntry(RumPerformanceEntryType.NAVIGATION)

    setLoadEvent(entry.loadEventEnd)
    clock.tick(PAGE_ACTIVITY_END_DELAY)

    expect(loadingTimeCallback).toHaveBeenCalledOnceWith(entry.loadEventEnd)
  })

  it('should use loadEventEnd for initial view when load event is bigger than computed loading time', () => {
    const loadType = ViewLoadingType.INITIAL_LOAD
    startLoadingTimeTracking(loadType)

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)

    setLoadEvent(LOAD_EVENT_AFTER_ACTIVITY_TIMING)
    domMutationObservable.notify()
    clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)

    expect(loadingTimeCallback).toHaveBeenCalledOnceWith(LOAD_EVENT_AFTER_ACTIVITY_TIMING)
  })

  it('should use computed loading time for initial view when load event is smaller than computed loading time', () => {
    const loadType = ViewLoadingType.INITIAL_LOAD
    startLoadingTimeTracking(loadType)

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)

    setLoadEvent(LOAD_EVENT_BEFORE_ACTIVITY_TIMING)

    domMutationObservable.notify()
    clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)

    expect(loadingTimeCallback).toHaveBeenCalledOnceWith(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
  })

  it('should use computed loading time from time origin for initial view', () => {
    const loadType = ViewLoadingType.INITIAL_LOAD

    // introduce a gap between time origin and tracking start
    // ensure that `load event > activity delay` and `load event < activity delay + clock gap`
    // to make the test fail if the clock gap is not correctly taken into account
    const CLOCK_GAP = (LOAD_EVENT_AFTER_ACTIVITY_TIMING - BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY + 1) as Duration

    clock.tick(CLOCK_GAP)

    startLoadingTimeTracking(loadType)

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)

    setLoadEvent(LOAD_EVENT_BEFORE_ACTIVITY_TIMING)

    domMutationObservable.notify()
    clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)

    expect(loadingTimeCallback).toHaveBeenCalledOnceWith(addDuration(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY, CLOCK_GAP))
  })

  it('should discard loading time if page is hidden before activity', () => {
    setPageVisibility('hidden')
    startLoadingTimeTracking()

    expect(loadingTimeCallback).not.toHaveBeenCalled()
  })
})
