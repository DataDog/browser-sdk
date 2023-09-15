import type { RelativeTime, Duration } from '@datadog/browser-core'
import { addDuration } from '@datadog/browser-core'
import type { TestSetupBuilder } from '../../../../test'
import { createPerformanceEntry, setup } from '../../../../test'
import { RumPerformanceEntryType } from '../../../browser/performanceCollection'
import { LifeCycleEventType } from '../../lifeCycle'
import { PAGE_ACTIVITY_END_DELAY, PAGE_ACTIVITY_VALIDATION_DELAY } from '../../waitPageActivityEnd'
import { THROTTLE_VIEW_UPDATE_PERIOD } from '../trackViews'
import type { ViewTest } from '../setupViewTest.specHelper'
import { setupViewTest } from '../setupViewTest.specHelper'

const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = (PAGE_ACTIVITY_VALIDATION_DELAY * 0.8) as Duration

const AFTER_PAGE_ACTIVITY_END_DELAY = PAGE_ACTIVITY_END_DELAY * 1.1

const LOAD_EVENT_BEFORE_ACTIVITY_TIMING = (BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY * 0.8) as RelativeTime

const LOAD_EVENT_AFTER_ACTIVITY_TIMING = (BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY * 1.2) as RelativeTime

describe('trackLoadingTime', () => {
  let setupBuilder: TestSetupBuilder
  let viewTest: ViewTest

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeLocation('/foo')
      .beforeBuild((buildContext) => {
        viewTest = setupViewTest(buildContext)
        return viewTest
      })
      .withFakeClock()
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should have an undefined loading time if there is no activity on a route change', () => {
    const { clock } = setupBuilder.build()
    const { getViewUpdate, getViewUpdateCount, startView } = viewTest

    startView()
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdateCount()).toEqual(3)
    expect(getViewUpdate(2).commonViewMetrics.loadingTime).toBeUndefined()
  })

  it('should have a loading time equal to the activity time if there is a unique activity on a route change', () => {
    const { domMutationObservable, clock } = setupBuilder.build()
    const { getViewUpdate, startView } = viewTest

    startView()
    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    domMutationObservable.notify()
    clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdate(3).commonViewMetrics.loadingTime).toEqual(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
  })

  it('should use loadEventEnd for initial view when having no activity', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    const { getViewUpdate, getViewUpdateCount } = viewTest

    expect(getViewUpdateCount()).toEqual(1)
    const entry = createPerformanceEntry(RumPerformanceEntryType.NAVIGATION)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [entry])
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdateCount()).toEqual(2)
    expect(getViewUpdate(1).commonViewMetrics.loadingTime).toEqual(entry.loadEventEnd)
  })

  it('should use loadEventEnd for initial view when load event is bigger than computed loading time', () => {
    const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()
    const { getViewUpdate, getViewUpdateCount } = viewTest

    expect(getViewUpdateCount()).toEqual(1)

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, {
        loadEventEnd: LOAD_EVENT_AFTER_ACTIVITY_TIMING,
      }),
    ])

    domMutationObservable.notify()
    clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdateCount()).toEqual(2)
    expect(getViewUpdate(1).commonViewMetrics.loadingTime).toEqual(LOAD_EVENT_AFTER_ACTIVITY_TIMING)
  })

  it('should use computed loading time for initial view when load event is smaller than computed loading time', () => {
    const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()
    const { getViewUpdate, getViewUpdateCount } = viewTest

    expect(getViewUpdateCount()).toEqual(1)

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, {
        loadEventEnd: LOAD_EVENT_BEFORE_ACTIVITY_TIMING,
      }),
    ])
    domMutationObservable.notify()
    clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdateCount()).toEqual(2)
    expect(getViewUpdate(1).commonViewMetrics.loadingTime).toEqual(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
  })

  it('should use computed loading time from time origin for initial view', () => {
    // introduce a gap between time origin and tracking start
    // ensure that `load event > activity delay` and `load event < activity delay + clock gap`
    // to make the test fail if the clock gap is not correctly taken into account
    const CLOCK_GAP = (LOAD_EVENT_AFTER_ACTIVITY_TIMING - BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY + 1) as Duration

    setupBuilder.clock!.tick(CLOCK_GAP)

    const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()
    const { getViewUpdate, getViewUpdateCount } = viewTest

    expect(getViewUpdateCount()).toEqual(1)

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, {
        loadEventEnd: LOAD_EVENT_BEFORE_ACTIVITY_TIMING,
      }),
    ])

    domMutationObservable.notify()
    clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdateCount()).toEqual(2)
    expect(getViewUpdate(1).commonViewMetrics.loadingTime).toEqual(
      addDuration(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY, CLOCK_GAP)
    )
  })
})
