import type { Context, Duration, RelativeTime } from '@datadog/browser-core'
import {
  PageExitReason,
  timeStampNow,
  display,
  relativeToClocks,
  relativeNow,
  ExperimentalFeature,
  resetExperimentalFeatures,
} from '@datadog/browser-core'

import type { Clock } from '@datadog/browser-core/test'
import { mockClock, mockExperimentalFeatures, registerCleanupTask } from '@datadog/browser-core/test'
import { createPerformanceEntry, mockPerformanceObserver } from '../../../test'
import { RumEventType, ViewLoadingType } from '../../rawRumEvent.types'
import type { RumEvent } from '../../rumEvent.types'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { RumPerformanceEntry } from '../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import { PAGE_ACTIVITY_END_DELAY } from '../waitPageActivityEnd'
import type { ViewEvent } from './trackViews'
import { SESSION_KEEP_ALIVE_INTERVAL, THROTTLE_VIEW_UPDATE_PERIOD, KEEP_TRACKING_AFTER_VIEW_DELAY } from './trackViews'
import type { ViewTest } from './setupViewTest.specHelper'
import { setupViewTest } from './setupViewTest.specHelper'
import { isLayoutShiftSupported } from './viewMetrics/trackCumulativeLayoutShift'

describe('track views automatically', () => {
  const lifeCycle = new LifeCycle()
  let changeLocation: (to: string) => void
  let viewTest: ViewTest

  beforeEach(() => {
    viewTest = setupViewTest({ lifeCycle, initialLocation: '/foo' }, { name: 'initial view name' })
    changeLocation = viewTest.changeLocation

    registerCleanupTask(() => {
      viewTest.stop()
    })
  })

  describe('initial view', () => {
    it('should be created on start', () => {
      const { getViewCreate, getViewCreateCount } = viewTest

      expect(getViewCreateCount()).toBe(1)
      expect(getViewCreate(0).name).toBe('initial view name')
    })
  })

  describe('location changes', () => {
    it('should create new view on path change', () => {
      const { getViewCreateCount } = viewTest

      expect(getViewCreateCount()).toBe(1)

      changeLocation('/bar')

      expect(getViewCreateCount()).toBe(2)
    })

    it('should create new view on hash change from history', () => {
      const { getViewCreateCount } = viewTest

      expect(getViewCreateCount()).toBe(1)

      changeLocation('/foo#bar')

      expect(getViewCreateCount()).toBe(2)
    })

    function mockGetElementById() {
      const fakeGetElementById = (elementId: string) => (elementId === 'testHashValue') as any as HTMLElement
      return spyOn(document, 'getElementById').and.callFake(fakeGetElementById)
    }

    it('should not create a new view when it is an Anchor navigation', () => {
      const { getViewCreateCount } = viewTest
      mockGetElementById()
      expect(getViewCreateCount()).toBe(1)

      changeLocation('/foo#testHashValue')

      expect(getViewCreateCount()).toBe(1)
    })

    it('should not create a new view when the search part of the hash changes', () => {
      const { getViewCreateCount } = viewTest
      changeLocation('/foo#bar')
      expect(getViewCreateCount()).toBe(2)

      changeLocation('/foo#bar?search=1')
      changeLocation('/foo#bar?search=2')
      changeLocation('/foo#bar?')
      changeLocation('/foo#bar')

      expect(getViewCreateCount()).toBe(2)
    })
  })
})

describe('view lifecycle', () => {
  let lifeCycle: LifeCycle
  let viewTest: ViewTest
  let clock: Clock
  let notifySpy: jasmine.Spy
  let changeLocation: (to: string) => void

  beforeEach(() => {
    clock = mockClock()
    lifeCycle = new LifeCycle()
    notifySpy = spyOn(lifeCycle, 'notify').and.callThrough()

    viewTest = setupViewTest(
      { lifeCycle, initialLocation: '/foo' },
      {
        name: 'initial view name',
        service: 'initial service',
        version: 'initial version',
      }
    )

    changeLocation = viewTest.changeLocation

    registerCleanupTask(() => {
      viewTest.stop()
      clock.cleanup()
    })
  })

  describe('expire session', () => {
    it('should end the view when the session expires', () => {
      const { getViewEndCount } = viewTest

      expect(getViewEndCount()).toBe(0)

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

      expect(getViewEndCount()).toBe(1)
    })

    it('should send a final view update', () => {
      const { getViewUpdateCount, getViewUpdate } = viewTest

      expect(getViewUpdateCount()).toBe(1)

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

      expect(getViewUpdateCount()).toBe(2)
      expect(getViewUpdate(0).sessionIsActive).toBe(true)
      expect(getViewUpdate(1).sessionIsActive).toBe(false)
    })

    it('should not start a new view if the session expired', () => {
      const { getViewCreateCount } = viewTest

      expect(getViewCreateCount()).toBe(1)

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

      expect(getViewCreateCount()).toBe(1)
    })

    it('should not end the view if the view already ended', () => {
      const { getViewEndCount, getViewUpdateCount } = viewTest

      lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: PageExitReason.UNLOADING })

      expect(getViewEndCount()).toBe(1)
      expect(getViewUpdateCount()).toBe(2)

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

      expect(getViewEndCount()).toBe(1)
      expect(getViewUpdateCount()).toBe(2)
    })
  })

  describe('renew session', () => {
    it('should create new view on renew session', () => {
      const { getViewCreateCount } = viewTest

      expect(getViewCreateCount()).toBe(1)

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      expect(getViewCreateCount()).toBe(2)
    })

    it('should use the current view name, service and version for the new view', () => {
      const { getViewCreateCount, getViewCreate, startView } = viewTest
      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      startView({ name: 'view 1', service: 'service 1', version: 'version 1' })
      startView({ name: 'view 2', service: 'service 2', version: 'version 2' })
      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      startView({ name: 'view 3', service: 'service 3', version: 'version 3' })
      changeLocation('/bar')
      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      expect(getViewCreateCount()).toBe(8)

      expect(getViewCreate(0)).toEqual(
        jasmine.objectContaining({
          name: 'initial view name',
          service: 'initial service',
          version: 'initial version',
        })
      )
      expect(getViewCreate(1)).toEqual(
        jasmine.objectContaining({
          name: 'initial view name',
          service: 'initial service',
          version: 'initial version',
        })
      )
      expect(getViewCreate(2)).toEqual(
        jasmine.objectContaining({
          name: 'view 1',
          service: 'service 1',
          version: 'version 1',
        })
      )
      expect(getViewCreate(3)).toEqual(
        jasmine.objectContaining({
          name: 'view 2',
          service: 'service 2',
          version: 'version 2',
        })
      )
      expect(getViewCreate(4)).toEqual(
        jasmine.objectContaining({
          name: 'view 2',
          service: 'service 2',
          version: 'version 2',
        })
      )
      expect(getViewCreate(5)).toEqual(
        jasmine.objectContaining({
          name: 'view 3',
          service: 'service 3',
          version: 'version 3',
        })
      )
      expect(getViewCreate(6)).toEqual(
        jasmine.objectContaining({
          name: undefined,
          service: undefined,
          version: undefined,
        })
      )
      expect(getViewCreate(7)).toEqual(
        jasmine.objectContaining({
          name: undefined,
          service: undefined,
          version: undefined,
        })
      )
    })
  })

  describe('session keep alive', () => {
    it('should emit a view update periodically', () => {
      const { getViewUpdateCount } = viewTest
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD) // make sure we don't have pending update

      const previousViewUpdateCount = getViewUpdateCount()

      clock.tick(SESSION_KEEP_ALIVE_INTERVAL)

      expect(getViewUpdateCount()).toEqual(previousViewUpdateCount + 1)
    })

    it('should not send periodical updates after the session has expired', () => {
      const { getViewUpdateCount } = viewTest
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD) // make sure we don't have pending update

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

      const previousViewUpdateCount = getViewUpdateCount()

      clock.tick(SESSION_KEEP_ALIVE_INTERVAL)

      expect(getViewUpdateCount()).toBe(previousViewUpdateCount)
    })
  })

  describe('page exit', () => {
    ;[
      { exitReason: PageExitReason.UNLOADING, expectViewEnd: true },
      { exitReason: PageExitReason.FROZEN, expectViewEnd: false },
      { exitReason: PageExitReason.HIDDEN, expectViewEnd: false },
    ].forEach(({ exitReason, expectViewEnd }) => {
      it(`should ${
        expectViewEnd ? '' : 'not '
      }end the current view when the page is exiting for reason ${exitReason}`, () => {
        const { getViewEndCount } = viewTest

        expect(getViewEndCount()).toEqual(0)

        lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: exitReason })

        expect(getViewEndCount()).toEqual(expectViewEnd ? 1 : 0)
      })
    })

    it('should not create a new view when ending the view on page exit', () => {
      const { getViewCreateCount } = viewTest

      expect(getViewCreateCount()).toEqual(1)

      lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: PageExitReason.UNLOADING })

      expect(getViewCreateCount()).toEqual(1)
    })
  })

  it('should notify BEFORE_VIEW_CREATED before VIEW_CREATED', () => {
    expect(notifySpy.calls.argsFor(0)[0]).toEqual(LifeCycleEventType.BEFORE_VIEW_CREATED)
    expect(notifySpy.calls.argsFor(1)[0]).toEqual(LifeCycleEventType.VIEW_CREATED)
  })

  it('should notify AFTER_VIEW_ENDED after VIEW_ENDED', () => {
    const callsCount = notifySpy.calls.count()

    viewTest.stop()

    expect(notifySpy.calls.argsFor(callsCount)[0]).toEqual(LifeCycleEventType.VIEW_ENDED)
    expect(notifySpy.calls.argsFor(callsCount + 1)[0]).toEqual(LifeCycleEventType.AFTER_VIEW_ENDED)
  })
})

describe('view loading type', () => {
  const lifeCycle = new LifeCycle()
  let clock: Clock
  let viewTest: ViewTest

  beforeEach(() => {
    clock = mockClock()

    viewTest = setupViewTest({ lifeCycle })

    registerCleanupTask(() => {
      viewTest.stop()
      clock.cleanup()
    })
  })

  it('should collect initial view type as "initial_load"', () => {
    const { getViewUpdate } = viewTest

    expect(getViewUpdate(0).loadingType).toEqual(ViewLoadingType.INITIAL_LOAD)
  })

  it('should collect view type as "route_change" after a view change', () => {
    const { getViewUpdate, startView } = viewTest

    startView()

    expect(getViewUpdate(1).loadingType).toEqual(ViewLoadingType.INITIAL_LOAD)
    expect(getViewUpdate(2).loadingType).toEqual(ViewLoadingType.ROUTE_CHANGE)
  })
})

describe('view metrics', () => {
  const lifeCycle = new LifeCycle()
  let clock: Clock
  let viewTest: ViewTest
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void

  beforeEach(() => {
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())

    clock = mockClock()
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())
    viewTest = setupViewTest({ lifeCycle })

    registerCleanupTask(() => {
      viewTest.stop()
      clock.cleanup()
    })
  })

  describe('common view metrics', () => {
    it('should be updated when notified with a PERFORMANCE_ENTRY_COLLECTED event (throttled)', () => {
      if (!isLayoutShiftSupported()) {
        pending('CLS web vital not supported')
      }
      const { getViewUpdateCount, getViewUpdate } = viewTest

      expect(getViewUpdateCount()).toEqual(1)
      expect(getViewUpdate(0).initialViewMetrics).toEqual({})

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT),
      ])

      expect(getViewUpdateCount()).toEqual(1)

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getViewUpdateCount()).toEqual(2)
      expect(getViewUpdate(1).commonViewMetrics.cumulativeLayoutShift).toEqual({
        value: 0.1,
        targetSelector: undefined,
        time: clock.relative(0),
      })
    })

    it('should not be updated after view end', () => {
      if (!isLayoutShiftSupported()) {
        pending('CLS web vital not supported')
      }
      const { getViewUpdate, getViewUpdateCount, getViewCreateCount, startView } = viewTest
      startView()
      clock.tick(0) // run immediate timeouts (mostly for `trackNavigationTimings`)
      expect(getViewCreateCount()).toEqual(2)

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.LAYOUT_SHIFT),
      ])

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      const latestUpdate = getViewUpdate(getViewUpdateCount() - 1)
      const firstView = getViewUpdate(0)
      expect(latestUpdate.id).not.toBe(firstView.id)
    })
  })

  describe('initial view metrics', () => {
    it('updates should be throttled', () => {
      const { getViewUpdateCount, getViewUpdate } = viewTest
      expect(getViewUpdateCount()).toEqual(1)
      expect(getViewUpdate(0).initialViewMetrics).toEqual({})

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD - 1)

      expect(getViewUpdateCount()).toEqual(1)
      expect(getViewUpdate(0).initialViewMetrics).toEqual({})

      clock.tick(1)

      expect(getViewUpdateCount()).toEqual(2)
      expect(getViewUpdate(1).initialViewMetrics.navigationTimings).toEqual(jasmine.any(Object))
    })

    it('should be updated for 5 min after view end', () => {
      const { getViewCreateCount, getViewUpdate, getViewUpdateCount, startView } = viewTest
      startView()
      expect(getViewCreateCount()).toEqual(2)

      const lcpEntry = createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT)
      clock.tick(KEEP_TRACKING_AFTER_VIEW_DELAY - 1)

      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.PAINT), lcpEntry])

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      const latestUpdate = getViewUpdate(getViewUpdateCount() - 1)
      const firstView = getViewUpdate(0)
      expect(latestUpdate.id).toBe(firstView.id)
      expect(latestUpdate.initialViewMetrics.largestContentfulPaint?.value).toEqual(lcpEntry.startTime)
    })

    it('should not be updated 5 min after view end', () => {
      const { getViewCreateCount, getViewUpdate, getViewUpdateCount, startView } = viewTest
      startView()
      expect(getViewCreateCount()).toEqual(2)

      clock.tick(KEEP_TRACKING_AFTER_VIEW_DELAY)

      notifyPerformanceEntries([
        createPerformanceEntry(RumPerformanceEntryType.PAINT),
        createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT),
      ])

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      const latestUpdate = getViewUpdate(getViewUpdateCount() - 1)
      const firstView = getViewUpdate(0)
      expect(latestUpdate.id).not.toBe(firstView.id)
    })

    describe('when load event happening after initial view end', () => {
      let initialView: { init: ViewEvent; end: ViewEvent; last: ViewEvent }
      let secondView: { init: ViewEvent; last: ViewEvent }
      let viewDuration: Duration

      beforeEach(() => {
        const { getViewUpdateCount, getViewUpdate, startView } = viewTest

        expect(getViewUpdateCount()).toEqual(1)

        // `loadingTime` relies on the "page activity". To make sure we have a valid value, we need
        // to wait for the page activity time to be known.
        clock.tick(PAGE_ACTIVITY_END_DELAY)

        viewDuration = relativeNow()

        startView()

        expect(getViewUpdateCount()).toEqual(3)

        notifyPerformanceEntries([
          createPerformanceEntry(RumPerformanceEntryType.PAINT),
          createPerformanceEntry(RumPerformanceEntryType.NAVIGATION),
          createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT),
        ])

        clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

        expect(getViewUpdateCount()).toEqual(4)

        initialView = {
          end: getViewUpdate(1),
          init: getViewUpdate(0),
          last: getViewUpdate(3),
        }
        secondView = {
          init: getViewUpdate(2),
          last: getViewUpdate(2),
        }
      })

      it('should not be added on second view', () => {
        expect(secondView.last.initialViewMetrics).toEqual({})
      })

      it('should be added only on the initial view', () => {
        expect(initialView.last.initialViewMetrics).toEqual(
          jasmine.objectContaining({
            firstContentfulPaint: 123 as Duration,
            navigationTimings: jasmine.any(Object),
            largestContentfulPaint: { value: 789 as Duration, targetSelector: undefined },
          })
        )
      })

      it('should not update the initial view duration when updating it with new timings', () => {
        expect(initialView.end.duration).toBe(viewDuration)
        expect(initialView.last.duration).toBe(viewDuration)
      })

      it('should update the initial view loadingTime following the loadEventEnd value', () => {
        expect(initialView.last.commonViewMetrics.loadingTime).toEqual(jasmine.any(Number))
      })
    })
  })
})

describe('view is active', () => {
  const lifeCycle = new LifeCycle()
  let viewTest: ViewTest

  beforeEach(() => {
    viewTest = setupViewTest({ lifeCycle })

    registerCleanupTask(() => {
      viewTest.stop()
    })
  })

  it('should set initial view as active', () => {
    const { getViewUpdate } = viewTest

    expect(getViewUpdate(0).isActive).toBe(true)
  })

  it('should set old view as inactive and new one as active after a route change', () => {
    const { getViewUpdate, startView } = viewTest

    startView()

    expect(getViewUpdate(1).isActive).toBe(false)
    expect(getViewUpdate(2).isActive).toBe(true)
  })
})

describe('view custom timings', () => {
  const lifeCycle = new LifeCycle()
  let clock: Clock
  let viewTest: ViewTest

  beforeEach(() => {
    clock = mockClock()
    viewTest = setupViewTest({ lifeCycle, initialLocation: '/foo' })

    registerCleanupTask(() => {
      viewTest.stop()
      clock.cleanup()
    })
  })

  it('should add custom timing to current view', () => {
    clock.tick(0) // run immediate timeouts (mostly for `trackNavigationTimings`)
    const { getViewUpdate, startView, addTiming } = viewTest

    startView()

    const currentViewId = getViewUpdate(2).id
    clock.tick(20)
    addTiming('foo')

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    const view = getViewUpdate(3)
    expect(view.id).toEqual(currentViewId)
    expect(view.customTimings).toEqual({ foo: 20 as Duration })
  })

  it('should add multiple custom timings', () => {
    const { getViewUpdate, addTiming } = viewTest

    clock.tick(20)
    addTiming('foo')

    clock.tick(10)
    addTiming('bar')

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    const view = getViewUpdate(1)
    expect(view.customTimings).toEqual({
      bar: clock.relative(30),
      foo: clock.relative(20),
    })
  })

  it('should update custom timing', () => {
    const { getViewUpdate, addTiming } = viewTest

    clock.tick(20)
    addTiming('foo')

    clock.tick(10)
    addTiming('bar')

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    let view = getViewUpdate(1)
    expect(view.customTimings).toEqual({
      bar: clock.relative(30),
      foo: clock.relative(20),
    })

    clock.tick(20)
    addTiming('foo')

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    view = getViewUpdate(2)
    expect(view.customTimings).toEqual({
      bar: clock.relative(30),
      foo: clock.relative(THROTTLE_VIEW_UPDATE_PERIOD + 50),
    })
  })

  it('should add custom timing with a specific timestamp', () => {
    const { getViewUpdate, addTiming } = viewTest

    clock.tick(1234)
    addTiming('foo', timeStampNow())

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdate(1).customTimings).toEqual({
      foo: clock.relative(1234),
    })
  })

  it('should add custom timing with a specific relative time', () => {
    const { getViewUpdate, addTiming } = viewTest

    clock.tick(1234)
    addTiming('foo', relativeNow())

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdate(1).customTimings).toEqual({
      foo: clock.relative(1234),
    })
  })

  it('should sanitized timing name', () => {
    const { getViewUpdate, addTiming } = viewTest

    const displaySpy = spyOn(display, 'warn')

    clock.tick(1234)
    addTiming('foo bar-qux.@zip_21%$*€👋', timeStampNow())

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdate(1).customTimings).toEqual({
      'foo_bar-qux.@zip_21_$____': clock.relative(1234),
    })
    expect(displaySpy).toHaveBeenCalled()
  })

  it('should not add custom timing when the session has expired', () => {
    clock.tick(0) // run immediate timeouts (mostly for `trackNavigationTimings`)
    const { getViewUpdateCount, addTiming } = viewTest

    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

    expect(getViewUpdateCount()).toBe(2)

    addTiming('foo', relativeNow())

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdateCount()).toBe(2)
  })
})

describe('start view', () => {
  const lifeCycle = new LifeCycle()
  let clock: Clock
  let viewTest: ViewTest

  beforeEach(() => {
    clock = mockClock()
    viewTest = setupViewTest({ lifeCycle })

    registerCleanupTask(() => {
      viewTest.stop()
      clock.cleanup()
    })
  })

  it('should start a new view', () => {
    const { getViewUpdateCount, getViewUpdate, startView } = viewTest

    expect(getViewUpdateCount()).toBe(1)
    const initialViewId = getViewUpdate(0).id

    clock.tick(10)
    startView()

    expect(getViewUpdateCount()).toBe(3)

    expect(getViewUpdate(1).id).toBe(initialViewId)
    expect(getViewUpdate(1).isActive).toBe(false)
    expect(getViewUpdate(1).startClocks.relative).toBe(0 as RelativeTime)
    expect(getViewUpdate(1).duration).toBe(clock.relative(10))

    expect(getViewUpdate(2).id).not.toBe(initialViewId)
    expect(getViewUpdate(2).isActive).toBe(true)
    expect(getViewUpdate(2).startClocks.relative).toBe(clock.relative(10))
  })

  it('should name the view', () => {
    const { getViewUpdate, startView } = viewTest

    startView()
    startView({ name: 'foo' })
    startView({ name: 'bar' })

    expect(getViewUpdate(2).name).toBeUndefined()
    expect(getViewUpdate(4).name).toBe('foo')
    expect(getViewUpdate(6).name).toBe('bar')
  })

  it('should have service and version', () => {
    const { getViewUpdate, startView } = viewTest

    startView()
    startView({ service: 'service 1', version: 'version 1' })
    startView({ service: 'service 2', version: 'version 2' })

    expect(getViewUpdate(2)).toEqual(
      jasmine.objectContaining({
        service: undefined,
        version: undefined,
      })
    )
    expect(getViewUpdate(4)).toEqual(
      jasmine.objectContaining({
        service: 'service 1',
        version: 'version 1',
      })
    )
    expect(getViewUpdate(6)).toEqual(
      jasmine.objectContaining({
        service: 'service 2',
        version: 'version 2',
      })
    )
  })

  it('should ignore null service/version', () => {
    const { getViewUpdate, startView } = viewTest

    startView({ service: null, version: null })
    expect(getViewUpdate(2)).toEqual(
      jasmine.objectContaining({
        service: undefined,
        version: undefined,
      })
    )
  })

  it('should use the provided clock to stop the current view and start the new one', () => {
    const { getViewUpdate, startView } = viewTest

    clock.tick(100)
    startView({ name: 'foo' }, relativeToClocks(50 as RelativeTime))

    expect(getViewUpdate(1).duration).toBe(50 as Duration)
    expect(getViewUpdate(2).startClocks.relative).toBe(50 as RelativeTime)
  })
})

describe('view event count', () => {
  const lifeCycle = new LifeCycle()
  let clock: Clock
  let viewTest: ViewTest

  beforeEach(() => {
    clock = mockClock()

    registerCleanupTask(() => {
      viewTest.stop()
      clock.cleanup()
      resetExperimentalFeatures()
    })
  })

  it('should be updated when notified with a RUM_EVENT_COLLECTED event', () => {
    viewTest = setupViewTest({ lifeCycle })
    const { getViewUpdate, getViewUpdateCount } = viewTest

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, createFakeActionEvent())

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdate(getViewUpdateCount() - 1).eventCounts.actionCount).toBe(1)
  })

  it('should take child events occurring on view end into account', () => {
    viewTest = setupViewTest({ lifeCycle })
    const { getViewUpdate, getViewUpdateCount } = viewTest

    lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, createFakeActionEvent())
    })

    lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: PageExitReason.UNLOADING })

    expect(getViewUpdate(getViewUpdateCount() - 1).eventCounts.actionCount).toBe(1)
  })

  it('should be updated for 5 min after view end', () => {
    viewTest = setupViewTest({ lifeCycle })
    const { getViewUpdate, getViewUpdateCount, getViewCreateCount, startView } = viewTest
    startView()
    expect(getViewCreateCount()).toEqual(2)
    const firstView = getViewUpdate(0)

    clock.tick(KEEP_TRACKING_AFTER_VIEW_DELAY - 1)

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.RESOURCE,
      view: { id: firstView.id },
    } as RumEvent & Context)

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    const latestUpdate = getViewUpdate(getViewUpdateCount() - 1)
    expect(latestUpdate.id).toEqual(firstView.id)
    expect(latestUpdate.eventCounts.resourceCount).toEqual(1)
  })

  it('should not be updated 5 min after view end', () => {
    viewTest = setupViewTest({ lifeCycle })
    const { getViewUpdate, getViewUpdateCount, getViewCreateCount, startView } = viewTest
    startView()
    expect(getViewCreateCount()).toEqual(2)
    const firstView = getViewUpdate(0)

    clock.tick(KEEP_TRACKING_AFTER_VIEW_DELAY)

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      type: RumEventType.RESOURCE,
      view: { id: firstView.id },
    } as RumEvent & Context)

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    const latestUpdate = getViewUpdate(getViewUpdateCount() - 1)
    expect(latestUpdate.id).not.toEqual(firstView.id)
  })

  function createFakeActionEvent() {
    return {
      type: RumEventType.ACTION,
      action: {},
      view: viewTest.getLatestViewContext(),
    } as RumEvent & Context
  }

  describe('view specific context', () => {
    it('should update view context if startView has context parameter', () => {
      mockExperimentalFeatures([ExperimentalFeature.VIEW_SPECIFIC_CONTEXT])
      viewTest = setupViewTest({ lifeCycle })
      const { getViewUpdate, startView } = viewTest

      startView({ context: { foo: 'bar' } })
      expect(getViewUpdate(2).context).toEqual({ foo: 'bar' })
    })

    it('should replace current context set on view event', () => {
      mockExperimentalFeatures([ExperimentalFeature.VIEW_SPECIFIC_CONTEXT])
      viewTest = setupViewTest({ lifeCycle })
      const { getViewUpdate, startView } = viewTest

      startView({ context: { foo: 'bar' } })
      expect(getViewUpdate(2).context).toEqual({ foo: 'bar' })

      startView({ context: { bar: 'baz' } })
      expect(getViewUpdate(4).context).toEqual({ bar: 'baz' })
    })

    it('should not update view context if the feature is not enabled', () => {
      viewTest = setupViewTest({ lifeCycle })
      const { getViewUpdate, startView } = viewTest

      startView({ context: { foo: 'bar' } })
      expect(getViewUpdate(2).context).toBeUndefined()
    })

    it('should set view context with setViewContext', () => {
      mockExperimentalFeatures([ExperimentalFeature.VIEW_SPECIFIC_CONTEXT])
      viewTest = setupViewTest({ lifeCycle })
      const { getViewUpdate, setViewContext } = viewTest

      setViewContext({ foo: 'bar' })
      expect(getViewUpdate(1).context).toEqual({ foo: 'bar' })
    })

    it('should set view context with setViewContextProperty', () => {
      mockExperimentalFeatures([ExperimentalFeature.VIEW_SPECIFIC_CONTEXT])
      viewTest = setupViewTest({ lifeCycle })
      const { getViewUpdate, setViewContextProperty } = viewTest

      setViewContextProperty('foo', 'bar')
      expect(getViewUpdate(1).context).toEqual({ foo: 'bar' })
    })
  })

  describe('update view name', () => {
    it('should update an undefined view name if the experimental feature is enabled', () => {
      mockExperimentalFeatures([ExperimentalFeature.UPDATE_VIEW_NAME])
      viewTest = setupViewTest({ lifeCycle })

      const { getViewUpdate, startView, updateViewName } = viewTest

      startView()
      updateViewName('foo')
      expect(getViewUpdate(3).name).toEqual('foo')
    })

    it('should update a defined view name if the experimental feature is enabled', () => {
      mockExperimentalFeatures([ExperimentalFeature.UPDATE_VIEW_NAME])
      viewTest = setupViewTest({ lifeCycle })

      const { getViewUpdate, startView, updateViewName } = viewTest

      startView({ name: 'initial view name' })
      updateViewName('foo')
      expect(getViewUpdate(3).name).toEqual('foo')
    })

    it('should not update a defined view name if the experimental feature is not enabled', () => {
      viewTest = setupViewTest({ lifeCycle })

      const { getViewUpdate, startView, updateViewName } = viewTest

      startView({ name: 'initial view name' })
      updateViewName('foo')
      expect(getViewUpdate(2).name).toEqual('initial view name')
    })
  })
})
