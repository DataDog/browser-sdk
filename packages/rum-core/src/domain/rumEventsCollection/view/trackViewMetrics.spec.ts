import type { Context, RelativeTime, Duration } from '@datadog/browser-core'
import { relativeNow } from '@datadog/browser-core'
import type { RumEvent } from '../../../rumEvent.types'
import type { TestSetupBuilder, ViewTest } from '../../../../test/specHelper'
import { setup, setupViewTest } from '../../../../test/specHelper'
import type { RumPerformanceNavigationTiming } from '../../../browser/performanceCollection'
import { FrustrationType, RumEventType } from '../../../rawRumEvent.types'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import { PAGE_ACTIVITY_END_DELAY, PAGE_ACTIVITY_VALIDATION_DELAY } from '../../waitPageActivityEnd'
import { THROTTLE_VIEW_UPDATE_PERIOD } from './trackViews'

const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = (PAGE_ACTIVITY_VALIDATION_DELAY * 0.8) as Duration

const AFTER_PAGE_ACTIVITY_END_DELAY = PAGE_ACTIVITY_END_DELAY * 1.1

const FAKE_NAVIGATION_ENTRY: RumPerformanceNavigationTiming = {
  responseStart: 123 as RelativeTime,
  domComplete: 456 as RelativeTime,
  domContentLoadedEventEnd: 345 as RelativeTime,
  domInteractive: 234 as RelativeTime,
  entryType: 'navigation',
  loadEventEnd: 567 as RelativeTime,
}

const FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_BEFORE_ACTIVITY_TIMING: RumPerformanceNavigationTiming = {
  responseStart: 1 as RelativeTime,
  domComplete: 2 as RelativeTime,
  domContentLoadedEventEnd: 1 as RelativeTime,
  domInteractive: 1 as RelativeTime,
  entryType: 'navigation',
  loadEventEnd: (BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY * 0.8) as RelativeTime,
}

const FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_AFTER_ACTIVITY_TIMING: RumPerformanceNavigationTiming = {
  responseStart: 1 as RelativeTime,
  domComplete: 2 as RelativeTime,
  domContentLoadedEventEnd: 1 as RelativeTime,
  domInteractive: 1 as RelativeTime,
  entryType: 'navigation',
  loadEventEnd: (BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY * 1.2) as RelativeTime,
}

describe('rum track view metrics', () => {
  let setupBuilder: TestSetupBuilder
  let viewTest: ViewTest

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeLocation('/foo')
      .beforeBuild((buildContext) => {
        viewTest = setupViewTest(buildContext)
        return viewTest
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('loading time', () => {
    beforeEach(() => {
      setupBuilder.withFakeClock()
    })

    it('should have an undefined loading time if there is no activity on a route change', () => {
      const { clock } = setupBuilder.build()
      const { getViewUpdate, getViewUpdateCount, startView } = viewTest

      startView()
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getViewUpdateCount()).toEqual(3)
      expect(getViewUpdate(2).loadingTime).toBeUndefined()
    })

    it('should have a loading time equal to the activity time if there is a unique activity on a route change', () => {
      const { domMutationObservable, clock } = setupBuilder.build()
      const { getViewUpdate, startView } = viewTest

      startView()
      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      domMutationObservable.notify()
      clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getViewUpdate(3).loadingTime).toEqual(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    })

    it('should use loadEventEnd for initial view when having no activity', () => {
      const { lifeCycle, clock } = setupBuilder.build()
      const { getViewUpdate, getViewUpdateCount } = viewTest

      expect(getViewUpdateCount()).toEqual(1)

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_NAVIGATION_ENTRY])
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getViewUpdateCount()).toEqual(2)
      expect(getViewUpdate(1).loadingTime).toEqual(FAKE_NAVIGATION_ENTRY.loadEventEnd)
    })

    it('should use loadEventEnd for initial view when load event is bigger than computed loading time', () => {
      const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()
      const { getViewUpdate, getViewUpdateCount } = viewTest

      expect(getViewUpdateCount()).toEqual(1)

      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_AFTER_ACTIVITY_TIMING,
      ])

      domMutationObservable.notify()
      clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getViewUpdateCount()).toEqual(2)
      expect(getViewUpdate(1).loadingTime).toEqual(
        FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_AFTER_ACTIVITY_TIMING.loadEventEnd
      )
    })

    // eslint-disable-next-line max-len
    it('should use computed loading time for initial view when load event is smaller than computed loading time', () => {
      const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()
      const { getViewUpdate, getViewUpdateCount } = viewTest

      expect(getViewUpdateCount()).toEqual(1)

      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_BEFORE_ACTIVITY_TIMING,
      ])
      domMutationObservable.notify()
      clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getViewUpdateCount()).toEqual(2)
      expect(getViewUpdate(1).loadingTime).toEqual(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    })

    it('should use computed loading time from time origin for initial view', () => {
      // introduce a gap between time origin and tracking start
      // ensure that `load event > activity delay` and `load event < activity delay + clock gap`
      // to make the test fail if the clock gap is not correctly taken into account
      const CLOCK_GAP =
        FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_AFTER_ACTIVITY_TIMING.loadEventEnd -
        BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY +
        1

      setupBuilder.clock!.tick(CLOCK_GAP)

      const { lifeCycle, domMutationObservable, clock } = setupBuilder.build()
      const { getViewUpdate, getViewUpdateCount } = viewTest

      expect(getViewUpdateCount()).toEqual(1)

      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_AFTER_ACTIVITY_TIMING,
      ])

      domMutationObservable.notify()
      clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getViewUpdateCount()).toEqual(2)
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      expect(getViewUpdate(1).loadingTime).toEqual((BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY + CLOCK_GAP) as Duration)
    })
  })

  describe('event counts', () => {
    it('should track error count', () => {
      const { lifeCycle } = setupBuilder.build()
      const { getViewUpdate, getViewUpdateCount, startView } = viewTest

      expect(getViewUpdateCount()).toEqual(1)
      expect(getViewUpdate(0).eventCounts.errorCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.ERROR } as RumEvent & Context)
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.ERROR } as RumEvent & Context)
      startView()

      expect(getViewUpdateCount()).toEqual(3)
      expect(getViewUpdate(1).eventCounts.errorCount).toEqual(2)
      expect(getViewUpdate(2).eventCounts.errorCount).toEqual(0)
    })

    it('should track long task count', () => {
      const { lifeCycle } = setupBuilder.build()
      const { getViewUpdate, getViewUpdateCount, startView } = viewTest

      expect(getViewUpdateCount()).toEqual(1)
      expect(getViewUpdate(0).eventCounts.longTaskCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.LONG_TASK } as RumEvent & Context)
      startView()

      expect(getViewUpdateCount()).toEqual(3)
      expect(getViewUpdate(1).eventCounts.longTaskCount).toEqual(1)
      expect(getViewUpdate(2).eventCounts.longTaskCount).toEqual(0)
    })

    it('should track resource count', () => {
      const { lifeCycle } = setupBuilder.build()
      const { getViewUpdate, getViewUpdateCount, startView } = viewTest

      expect(getViewUpdateCount()).toEqual(1)
      expect(getViewUpdate(0).eventCounts.resourceCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.RESOURCE } as RumEvent & Context)
      startView()

      expect(getViewUpdateCount()).toEqual(3)
      expect(getViewUpdate(1).eventCounts.resourceCount).toEqual(1)
      expect(getViewUpdate(2).eventCounts.resourceCount).toEqual(0)
    })

    it('should track action count', () => {
      const { lifeCycle } = setupBuilder.build()
      const { getViewUpdate, getViewUpdateCount, startView } = viewTest

      expect(getViewUpdateCount()).toEqual(1)
      expect(getViewUpdate(0).eventCounts.actionCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ACTION,
        action: { type: 'custom' },
      } as RumEvent & Context)
      startView()

      expect(getViewUpdateCount()).toEqual(3)
      expect(getViewUpdate(1).eventCounts.actionCount).toEqual(1)
      expect(getViewUpdate(2).eventCounts.actionCount).toEqual(0)
    })

    it('should track frustration count', () => {
      const { lifeCycle } = setupBuilder.build()
      const { getViewUpdate, getViewUpdateCount, startView } = viewTest

      expect(getViewUpdateCount()).toEqual(1)
      expect(getViewUpdate(0).eventCounts.frustrationCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ACTION,
        action: {
          type: 'click',
          frustration: {
            type: [FrustrationType.DEAD_CLICK, FrustrationType.ERROR_CLICK],
          },
        },
      } as RumEvent & Context)
      startView()

      expect(getViewUpdateCount()).toEqual(3)
      expect(getViewUpdate(1).eventCounts.frustrationCount).toEqual(2)
      expect(getViewUpdate(2).eventCounts.frustrationCount).toEqual(0)
    })

    it('should reset event count when the view changes', () => {
      const { lifeCycle, changeLocation } = setupBuilder.build()
      const { getViewUpdate, getViewUpdateCount, startView } = viewTest

      expect(getViewUpdateCount()).toEqual(1)
      expect(getViewUpdate(0).eventCounts.resourceCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.RESOURCE } as RumEvent & Context)
      startView()

      expect(getViewUpdateCount()).toEqual(3)
      expect(getViewUpdate(1).eventCounts.resourceCount).toEqual(1)
      expect(getViewUpdate(2).eventCounts.resourceCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.RESOURCE } as RumEvent & Context)
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.RESOURCE } as RumEvent & Context)
      changeLocation('/baz')

      expect(getViewUpdateCount()).toEqual(5)
      expect(getViewUpdate(3).eventCounts.resourceCount).toEqual(2)
      expect(getViewUpdate(4).eventCounts.resourceCount).toEqual(0)
    })

    it('should update eventCounts when a resource event is collected (throttled)', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      const { getViewUpdate, getViewUpdateCount } = viewTest

      expect(getViewUpdateCount()).toEqual(1)
      expect(getViewUpdate(0).eventCounts).toEqual({
        errorCount: 0,
        longTaskCount: 0,
        resourceCount: 0,
        actionCount: 0,
        frustrationCount: 0,
      })

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.RESOURCE } as RumEvent & Context)

      expect(getViewUpdateCount()).toEqual(1)

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getViewUpdateCount()).toEqual(2)
      expect(getViewUpdate(1).eventCounts).toEqual({
        errorCount: 0,
        longTaskCount: 0,
        resourceCount: 1,
        actionCount: 0,
        frustrationCount: 0,
      })
    })

    it('should not update eventCounts after ending a view', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      const { getViewUpdate, getViewUpdateCount, startView } = viewTest

      expect(getViewUpdateCount()).toEqual(1)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.RESOURCE } as RumEvent & Context)

      expect(getViewUpdateCount()).toEqual(1)

      startView()

      expect(getViewUpdateCount()).toEqual(3)
      expect(getViewUpdate(1).id).toEqual(getViewUpdate(0).id)
      expect(getViewUpdate(2).id).not.toEqual(getViewUpdate(0).id)

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getViewUpdateCount()).toEqual(3)
    })
  })

  describe('cumulativeLayoutShift', () => {
    let isLayoutShiftSupported: boolean
    let originalSupportedEntryTypes: PropertyDescriptor | undefined

    function newLayoutShift(lifeCycle: LifeCycle, { value = 0.1, hadRecentInput = false }) {
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        {
          entryType: 'layout-shift',
          startTime: relativeNow(),
          hadRecentInput,
          value,
        },
      ])
    }

    beforeEach(() => {
      if (!('PerformanceObserver' in window) || !('supportedEntryTypes' in PerformanceObserver)) {
        pending('No PerformanceObserver support')
      }
      originalSupportedEntryTypes = Object.getOwnPropertyDescriptor(PerformanceObserver, 'supportedEntryTypes')
      isLayoutShiftSupported = true
      Object.defineProperty(PerformanceObserver, 'supportedEntryTypes', {
        get: () => (isLayoutShiftSupported ? ['layout-shift'] : []),
      })
    })

    afterEach(() => {
      if (originalSupportedEntryTypes) {
        Object.defineProperty(PerformanceObserver, 'supportedEntryTypes', originalSupportedEntryTypes)
      }
    })

    it('should be initialized to 0', () => {
      setupBuilder.build()
      const { getViewUpdate, getViewUpdateCount } = viewTest

      expect(getViewUpdateCount()).toEqual(1)
      expect(getViewUpdate(0).cumulativeLayoutShift).toBe(0)
    })

    it('should be initialized to undefined if layout-shift is not supported', () => {
      isLayoutShiftSupported = false
      setupBuilder.build()
      const { getViewUpdate, getViewUpdateCount } = viewTest

      expect(getViewUpdateCount()).toEqual(1)
      expect(getViewUpdate(0).cumulativeLayoutShift).toBe(undefined)
    })

    it('should accumulate layout shift values for the first session window', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      const { getViewUpdate, getViewUpdateCount } = viewTest
      newLayoutShift(lifeCycle, { value: 0.1 })
      clock.tick(100)
      newLayoutShift(lifeCycle, { value: 0.2 })
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getViewUpdateCount()).toEqual(2)
      expect(getViewUpdate(1).cumulativeLayoutShift).toBe(0.3)
    })

    it('should round the cumulative layout shift value to 4 decimals', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      const { getViewUpdate, getViewUpdateCount } = viewTest
      newLayoutShift(lifeCycle, { value: 1.23456789 })
      clock.tick(100)
      newLayoutShift(lifeCycle, { value: 1.11111111111 })
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getViewUpdateCount()).toEqual(2)
      expect(getViewUpdate(1).cumulativeLayoutShift).toBe(2.3457)
    })

    it('should ignore entries with recent input', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      const { getViewUpdate, getViewUpdateCount } = viewTest

      newLayoutShift(lifeCycle, { value: 0.1, hadRecentInput: true })

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getViewUpdateCount()).toEqual(1)
      expect(getViewUpdate(0).cumulativeLayoutShift).toBe(0)
    })

    it('should create a new session window if the gap is more than 1 second', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      const { getViewUpdate, getViewUpdateCount } = viewTest
      // first session window
      newLayoutShift(lifeCycle, { value: 0.1 })
      clock.tick(100)
      newLayoutShift(lifeCycle, { value: 0.2 })
      // second session window
      clock.tick(1001)
      newLayoutShift(lifeCycle, { value: 0.1 })

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)
      expect(getViewUpdateCount()).toEqual(2)
      expect(getViewUpdate(1).cumulativeLayoutShift).toBe(0.3)
    })

    it('should create a new session window if the current session window is more than 5 second', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      const { getViewUpdate, getViewUpdateCount } = viewTest
      newLayoutShift(lifeCycle, { value: 0 })
      for (let i = 0; i < 6; i += 1) {
        clock.tick(999)
        newLayoutShift(lifeCycle, { value: 0.1 })
      } // window 1: 0.5 | window 2: 0.1
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)
      expect(getViewUpdateCount()).toEqual(3)
      expect(getViewUpdate(2).cumulativeLayoutShift).toBe(0.5)
    })

    it('should get the max value sessions', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      const { getViewUpdate, getViewUpdateCount } = viewTest
      // first session window
      newLayoutShift(lifeCycle, { value: 0.1 })
      newLayoutShift(lifeCycle, { value: 0.2 })
      // second session window
      clock.tick(5001)
      newLayoutShift(lifeCycle, { value: 0.1 })
      newLayoutShift(lifeCycle, { value: 0.2 })
      newLayoutShift(lifeCycle, { value: 0.2 })
      // third session window
      clock.tick(5001)
      newLayoutShift(lifeCycle, { value: 0.2 })
      newLayoutShift(lifeCycle, { value: 0.2 })

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)
      expect(getViewUpdateCount()).toEqual(3)
      expect(getViewUpdate(2).cumulativeLayoutShift).toBe(0.5)
    })
  })
})
