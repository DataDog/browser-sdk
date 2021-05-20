import { LifeCycleEventType, RumEvent } from '@datadog/browser-rum-core'
import { Context, RelativeTime, Duration } from '@datadog/browser-core'
import { TestSetupBuilder, setup } from '../../../../test/specHelper'
import { RumEventType } from '../../../rawRumEvent.types'
import { RumPerformanceNavigationTiming } from '../../../browser/performanceCollection'
import {
  PAGE_ACTIVITY_END_DELAY,
  PAGE_ACTIVITY_MAX_DURATION,
  PAGE_ACTIVITY_VALIDATION_DELAY,
} from '../../trackPageActivities'
import { ViewEvent, trackViews, THROTTLE_VIEW_UPDATE_PERIOD } from './trackViews'

const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = (PAGE_ACTIVITY_VALIDATION_DELAY * 0.8) as Duration

const AFTER_PAGE_ACTIVITY_MAX_DURATION = PAGE_ACTIVITY_MAX_DURATION * 1.1

const AFTER_PAGE_ACTIVITY_END_DELAY = PAGE_ACTIVITY_END_DELAY * 1.1

const FAKE_NAVIGATION_ENTRY: RumPerformanceNavigationTiming = {
  domComplete: 456 as RelativeTime,
  domContentLoadedEventEnd: 345 as RelativeTime,
  domInteractive: 234 as RelativeTime,
  entryType: 'navigation',
  loadEventEnd: 567 as RelativeTime,
}

const FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_BEFORE_ACTIVITY_TIMING: RumPerformanceNavigationTiming = {
  domComplete: 2 as RelativeTime,
  domContentLoadedEventEnd: 1 as RelativeTime,
  domInteractive: 1 as RelativeTime,
  entryType: 'navigation',
  loadEventEnd: (BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY * 0.8) as RelativeTime,
}

const FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_AFTER_ACTIVITY_TIMING: RumPerformanceNavigationTiming = {
  domComplete: 2 as RelativeTime,
  domContentLoadedEventEnd: 1 as RelativeTime,
  domInteractive: 1 as RelativeTime,
  entryType: 'navigation',
  loadEventEnd: (BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY * 1.2) as RelativeTime,
}

function spyOnViews() {
  const handler = jasmine.createSpy()

  function getViewEvent(index: number) {
    return handler.calls.argsFor(index)[0] as ViewEvent
  }

  function getHandledCount() {
    return handler.calls.count()
  }

  return { handler, getViewEvent, getHandledCount }
}

describe('rum track view metrics', () => {
  let setupBuilder: TestSetupBuilder
  let handler: jasmine.Spy
  let getViewEvent: (index: number) => ViewEvent
  let getHandledCount: () => number

  beforeEach(() => {
    ;({ handler, getHandledCount, getViewEvent } = spyOnViews())

    setupBuilder = setup()
      .withFakeLocation('/foo')
      .beforeBuild(({ location, lifeCycle, DOMMutation }) => {
        lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler)
        return trackViews(location, lifeCycle, DOMMutation)
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

      history.pushState({}, '', '/bar')
      clock.tick(AFTER_PAGE_ACTIVITY_MAX_DURATION)
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(2).loadingTime).toBeUndefined()
    })

    it('should have a loading time equal to the activity time if there is a unique activity on a route change', () => {
      const { DOMMutation, clock } = setupBuilder.build()

      history.pushState({}, '', '/bar')
      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      DOMMutation.notify()
      clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getViewEvent(3).loadingTime).toEqual(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    })

    it('should use loadEventEnd for initial view when having no activity', () => {
      const { lifeCycle, clock } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_NAVIGATION_ENTRY)
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getHandledCount()).toEqual(2)
      expect(getViewEvent(1).loadingTime).toEqual(FAKE_NAVIGATION_ENTRY.loadEventEnd)
    })

    it('should use loadEventEnd for initial view when load event is bigger than computed loading time', () => {
      const { lifeCycle, DOMMutation, clock } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)

      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)

      lifeCycle.notify(
        LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
        FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_AFTER_ACTIVITY_TIMING
      )

      DOMMutation.notify()
      clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getHandledCount()).toEqual(2)
      expect(getViewEvent(1).loadingTime).toEqual(
        FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_AFTER_ACTIVITY_TIMING.loadEventEnd
      )
    })

    // eslint-disable-next-line max-len
    it('should use computed loading time for initial view when load event is smaller than computed loading time', () => {
      const { lifeCycle, DOMMutation, clock } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)

      clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
      lifeCycle.notify(
        LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
        FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_BEFORE_ACTIVITY_TIMING
      )
      DOMMutation.notify()
      clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getHandledCount()).toEqual(2)
      expect(getViewEvent(1).loadingTime).toEqual(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    })
  })

  describe('event counts', () => {
    it('should track error count', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.errorCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.ERROR } as RumEvent & Context)
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.ERROR } as RumEvent & Context)
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.errorCount).toEqual(2)
      expect(getViewEvent(2).eventCounts.errorCount).toEqual(0)
    })

    it('should track long task count', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.longTaskCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.LONG_TASK } as RumEvent & Context)
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.longTaskCount).toEqual(1)
      expect(getViewEvent(2).eventCounts.longTaskCount).toEqual(0)
    })

    it('should track resource count', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.resourceCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.RESOURCE } as RumEvent & Context)
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.resourceCount).toEqual(1)
      expect(getViewEvent(2).eventCounts.resourceCount).toEqual(0)
    })

    it('should track action count', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.userActionCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.ACTION } as RumEvent & Context)
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.userActionCount).toEqual(1)
      expect(getViewEvent(2).eventCounts.userActionCount).toEqual(0)
    })

    it('should reset event count when the view changes', () => {
      const { lifeCycle } = setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts.resourceCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.RESOURCE } as RumEvent & Context)
      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).eventCounts.resourceCount).toEqual(1)
      expect(getViewEvent(2).eventCounts.resourceCount).toEqual(0)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.RESOURCE } as RumEvent & Context)
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.RESOURCE } as RumEvent & Context)
      history.pushState({}, '', '/baz')

      expect(getHandledCount()).toEqual(5)
      expect(getViewEvent(3).eventCounts.resourceCount).toEqual(2)
      expect(getViewEvent(4).eventCounts.resourceCount).toEqual(0)
    })

    it('should update eventCounts when a resource event is collected (throttled)', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).eventCounts).toEqual({
        errorCount: 0,
        longTaskCount: 0,
        resourceCount: 0,
        userActionCount: 0,
      })

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.RESOURCE } as RumEvent & Context)

      expect(getHandledCount()).toEqual(1)

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getHandledCount()).toEqual(2)
      expect(getViewEvent(1).eventCounts).toEqual({
        errorCount: 0,
        longTaskCount: 0,
        resourceCount: 1,
        userActionCount: 0,
      })
    })

    it('should not update eventCounts after ending a view', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      expect(getHandledCount()).toEqual(1)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, { type: RumEventType.RESOURCE } as RumEvent & Context)

      expect(getHandledCount()).toEqual(1)

      history.pushState({}, '', '/bar')

      expect(getHandledCount()).toEqual(3)
      expect(getViewEvent(1).id).toEqual(getViewEvent(0).id)
      expect(getViewEvent(2).id).not.toEqual(getViewEvent(0).id)

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getHandledCount()).toEqual(3)
    })
  })

  describe('cumulativeLayoutShift', () => {
    let isLayoutShiftSupported: boolean
    beforeEach(() => {
      if (!('PerformanceObserver' in window) || !('supportedEntryTypes' in PerformanceObserver)) {
        pending('No PerformanceObserver support')
      }
      isLayoutShiftSupported = true
      spyOnProperty(PerformanceObserver, 'supportedEntryTypes', 'get').and.callFake(() =>
        isLayoutShiftSupported ? ['layout-shift'] : []
      )
    })

    it('should be initialized to 0', () => {
      setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).cumulativeLayoutShift).toBe(0)
    })

    it('should be initialized to undefined if layout-shift is not supported', () => {
      isLayoutShiftSupported = false
      setupBuilder.build()
      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).cumulativeLayoutShift).toBe(undefined)
    })

    it('should accumulate layout shift values', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, {
        entryType: 'layout-shift',
        hadRecentInput: false,
        value: 0.1,
      })

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, {
        entryType: 'layout-shift',
        hadRecentInput: false,
        value: 0.2,
      })

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getHandledCount()).toEqual(2)
      expect(getViewEvent(1).cumulativeLayoutShift).toBe(0.3)
    })

    it('should round the cumulative layout shift value to 4 decimals', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, {
        entryType: 'layout-shift',
        hadRecentInput: false,
        value: 1.23456789,
      })

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, {
        entryType: 'layout-shift',
        hadRecentInput: false,
        value: 1.11111111111,
      })

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getHandledCount()).toEqual(2)
      expect(getViewEvent(1).cumulativeLayoutShift).toBe(2.3457)
    })

    it('should ignore entries with recent input', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, {
        entryType: 'layout-shift',
        hadRecentInput: true,
        value: 0.1,
      })

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getHandledCount()).toEqual(1)
      expect(getViewEvent(0).cumulativeLayoutShift).toBe(0)
    })
  })
})
