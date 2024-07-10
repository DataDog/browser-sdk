import type { Context, Duration, RelativeTime } from '@datadog/browser-core'
import {
  PageExitReason,
  timeStampNow,
  display,
  relativeToClocks,
  relativeNow,
  ExperimentalFeature,
} from '@datadog/browser-core'

import { mockExperimentalFeatures } from '@datadog/browser-core/test'
import type { TestSetupBuilder } from '../../../test'
import { createPerformanceEntry, setup } from '../../../test'
import { RumEventType, ViewLoadingType } from '../../rawRumEvent.types'
import type { RumEvent } from '../../rumEvent.types'
import { LifeCycleEventType } from '../lifeCycle'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import type { ViewEvent } from './trackViews'
import { SESSION_KEEP_ALIVE_INTERVAL, THROTTLE_VIEW_UPDATE_PERIOD, KEEP_TRACKING_AFTER_VIEW_DELAY } from './trackViews'
import type { ViewTest } from './setupViewTest.specHelper'
import { setupViewTest } from './setupViewTest.specHelper'
import { isLayoutShiftSupported } from './viewMetrics/trackCumulativeLayoutShift'

describe('track views automatically', () => {
  let setupBuilder: TestSetupBuilder
  let viewTest: ViewTest

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeLocation('/foo')
      .beforeBuild((buildContext) => {
        viewTest = setupViewTest(buildContext, { name: 'initial view name' })
        return viewTest
      })
  })

  describe('initial view', () => {
    it('should be created on start', () => {
      setupBuilder.build()
      const { getViewCreate, getViewCreateCount } = viewTest

      expect(getViewCreateCount()).toBe(1)
      expect(getViewCreate(0).name).toBe('initial view name')
    })
  })

  describe('location changes', () => {
    it('should create new view on path change', () => {
      const { changeLocation } = setupBuilder.build()
      const { getViewCreateCount } = viewTest

      expect(getViewCreateCount()).toBe(1)

      changeLocation('/bar')

      expect(getViewCreateCount()).toBe(2)
    })

    it('should create new view on hash change from history', () => {
      const { changeLocation } = setupBuilder.build()
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
      const { changeLocation } = setupBuilder.build()
      const { getViewCreateCount } = viewTest
      mockGetElementById()
      expect(getViewCreateCount()).toBe(1)

      changeLocation('/foo#testHashValue')

      expect(getViewCreateCount()).toBe(1)
    })

    it('should not create a new view when the search part of the hash changes', () => {
      const { changeLocation } = setupBuilder.build()
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
  let setupBuilder: TestSetupBuilder
  let viewTest: ViewTest
  let notifySpy: jasmine.Spy

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeLocation('/foo')
      .beforeBuild((buildContext) => {
        notifySpy = spyOn(buildContext.lifeCycle, 'notify').and.callThrough()

        viewTest = setupViewTest(buildContext, {
          name: 'initial view name',
          service: 'initial service',
          version: 'initial version',
        })
        return viewTest
      })
  })

  describe('expire session', () => {
    it('should end the view when the session expires', () => {
      const { lifeCycle } = setupBuilder.build()
      const { getViewEndCount } = viewTest

      expect(getViewEndCount()).toBe(0)

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

      expect(getViewEndCount()).toBe(1)
    })

    it('should send a final view update', () => {
      const { lifeCycle } = setupBuilder.build()
      const { getViewUpdateCount, getViewUpdate } = viewTest

      expect(getViewUpdateCount()).toBe(1)

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

      expect(getViewUpdateCount()).toBe(2)
      expect(getViewUpdate(0).sessionIsActive).toBe(true)
      expect(getViewUpdate(1).sessionIsActive).toBe(false)
    })

    it('should not start a new view if the session expired', () => {
      const { lifeCycle } = setupBuilder.build()
      const { getViewCreateCount } = viewTest

      expect(getViewCreateCount()).toBe(1)

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

      expect(getViewCreateCount()).toBe(1)
    })

    it('should not end the view if the view already ended', () => {
      const { lifeCycle } = setupBuilder.build()
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
      const { lifeCycle } = setupBuilder.build()
      const { getViewCreateCount } = viewTest

      expect(getViewCreateCount()).toBe(1)

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      expect(getViewCreateCount()).toBe(2)
    })

    it('should use the current view name, service and version for the new view', () => {
      const { lifeCycle, changeLocation } = setupBuilder.build()
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
      const { clock } = setupBuilder.withFakeClock().build()

      const { getViewUpdateCount } = viewTest

      expect(getViewUpdateCount()).toEqual(1)

      clock.tick(SESSION_KEEP_ALIVE_INTERVAL)

      expect(getViewUpdateCount()).toEqual(2)
    })

    it('should not send periodical updates after the session has expired', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      const { getViewUpdateCount } = viewTest

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

      expect(getViewUpdateCount()).toBe(2)

      clock.tick(SESSION_KEEP_ALIVE_INTERVAL)

      expect(getViewUpdateCount()).toBe(2)
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
        const { lifeCycle } = setupBuilder.build()
        const { getViewEndCount } = viewTest

        expect(getViewEndCount()).toEqual(0)

        lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: exitReason })

        expect(getViewEndCount()).toEqual(expectViewEnd ? 1 : 0)
      })
    })

    it('should not create a new view when ending the view on page exit', () => {
      const { lifeCycle } = setupBuilder.build()
      const { getViewCreateCount } = viewTest

      expect(getViewCreateCount()).toEqual(1)

      lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: PageExitReason.UNLOADING })

      expect(getViewCreateCount()).toEqual(1)
    })
  })

  it('should notify BEFORE_VIEW_CREATED before VIEW_CREATED', () => {
    setupBuilder.build()

    expect(notifySpy.calls.argsFor(0)[0]).toEqual(LifeCycleEventType.BEFORE_VIEW_CREATED)
    expect(notifySpy.calls.argsFor(1)[0]).toEqual(LifeCycleEventType.VIEW_CREATED)
  })

  it('should notify AFTER_VIEW_ENDED after VIEW_ENDED', () => {
    setupBuilder.build()
    const callsCount = notifySpy.calls.count()

    viewTest.stop()

    expect(notifySpy.calls.argsFor(callsCount)[0]).toEqual(LifeCycleEventType.VIEW_ENDED)
    expect(notifySpy.calls.argsFor(callsCount + 1)[0]).toEqual(LifeCycleEventType.AFTER_VIEW_ENDED)
  })
})

describe('view loading type', () => {
  let setupBuilder: TestSetupBuilder
  let viewTest: ViewTest

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeClock()
      .beforeBuild((buildContext) => {
        viewTest = setupViewTest(buildContext)
        return viewTest
      })
  })

  it('should collect initial view type as "initial_load"', () => {
    setupBuilder.build()
    const { getViewUpdate } = viewTest

    expect(getViewUpdate(0).loadingType).toEqual(ViewLoadingType.INITIAL_LOAD)
  })

  it('should collect view type as "route_change" after a view change', () => {
    setupBuilder.build()
    const { getViewUpdate, startView } = viewTest

    startView()

    expect(getViewUpdate(1).loadingType).toEqual(ViewLoadingType.INITIAL_LOAD)
    expect(getViewUpdate(2).loadingType).toEqual(ViewLoadingType.ROUTE_CHANGE)
  })
})

describe('view metrics', () => {
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

  describe('common view metrics', () => {
    it('should be updated when notified with a PERFORMANCE_ENTRY_COLLECTED event (throttled)', () => {
      if (!isLayoutShiftSupported()) {
        pending('CLS web vital not supported')
      }
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
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
        time: 0 as Duration,
      })
    })

    it('should not be updated after view end', () => {
      if (!isLayoutShiftSupported()) {
        pending('CLS web vital not supported')
      }
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      const { getViewUpdate, getViewUpdateCount, getViewCreateCount, startView } = viewTest
      startView()
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
    it('should be updated when notified with a PERFORMANCE_ENTRY_COLLECTED event (throttled)', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      const { getViewUpdateCount, getViewUpdate } = viewTest
      expect(getViewUpdateCount()).toEqual(1)
      expect(getViewUpdate(0).initialViewMetrics).toEqual({})

      const navigationEntry = createPerformanceEntry(RumPerformanceEntryType.NAVIGATION)
      clock.tick(navigationEntry.responseStart) // ensure now > responseStart
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [navigationEntry])

      expect(getViewUpdateCount()).toEqual(1)

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getViewUpdateCount()).toEqual(2)
      expect(getViewUpdate(1).initialViewMetrics.navigationTimings).toEqual({
        firstByte: 123 as Duration,
        domComplete: 456 as Duration,
        domContentLoaded: 345 as Duration,
        domInteractive: 234 as Duration,
        loadEvent: 567 as Duration,
      })
    })

    it('should be updated for 5 min after view end', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      const { getViewCreateCount, getViewUpdate, getViewUpdateCount, startView } = viewTest
      startView()
      expect(getViewCreateCount()).toEqual(2)

      const lcpEntry = createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT)
      clock.tick(KEEP_TRACKING_AFTER_VIEW_DELAY - 1)
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.PAINT),
        lcpEntry,
        createPerformanceEntry(RumPerformanceEntryType.NAVIGATION),
      ])
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      const latestUpdate = getViewUpdate(getViewUpdateCount() - 1)
      const firstView = getViewUpdate(0)
      expect(latestUpdate.id).toBe(firstView.id)
      expect(latestUpdate.initialViewMetrics.largestContentfulPaint?.value).toEqual(lcpEntry.startTime)
    })

    it('should not be updated 5 min after view end', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      const { getViewCreateCount, getViewUpdate, getViewUpdateCount, startView } = viewTest
      startView()
      expect(getViewCreateCount()).toEqual(2)

      clock.tick(KEEP_TRACKING_AFTER_VIEW_DELAY)
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        createPerformanceEntry(RumPerformanceEntryType.PAINT),
        createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT),
        createPerformanceEntry(RumPerformanceEntryType.NAVIGATION),
      ])
      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      const latestUpdate = getViewUpdate(getViewUpdateCount() - 1)
      const firstView = getViewUpdate(0)
      expect(latestUpdate.id).not.toBe(firstView.id)
    })

    describe('when load event happening after initial view end', () => {
      let initialView: { init: ViewEvent; end: ViewEvent; last: ViewEvent }
      let secondView: { init: ViewEvent; last: ViewEvent }
      const VIEW_DURATION = 100 as Duration

      beforeEach(() => {
        const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
        const { getViewUpdateCount, getViewUpdate, startView } = viewTest

        expect(getViewUpdateCount()).toEqual(1)

        clock.tick(VIEW_DURATION)

        startView()

        clock.tick(VIEW_DURATION)

        expect(getViewUpdateCount()).toEqual(3)

        lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
          createPerformanceEntry(RumPerformanceEntryType.PAINT),
          createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT),
          createPerformanceEntry(RumPerformanceEntryType.NAVIGATION),
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
            navigationTimings: {
              firstByte: 123 as Duration,
              domComplete: 456 as Duration,
              domContentLoaded: 345 as Duration,
              domInteractive: 234 as Duration,
              loadEvent: 567 as Duration,
            },
            largestContentfulPaint: { value: 789 as Duration, targetSelector: undefined },
          })
        )
      })

      it('should not update the initial view duration when updating it with new timings', () => {
        expect(initialView.end.duration).toBe(VIEW_DURATION)
        expect(initialView.last.duration).toBe(VIEW_DURATION)
      })

      it('should update the initial view loadingTime following the loadEventEnd value', () => {
        expect(initialView.last.commonViewMetrics.loadingTime).toBe(567 as RelativeTime)
      })
    })
  })
})

describe('view is active', () => {
  let setupBuilder: TestSetupBuilder
  let viewTest: ViewTest

  beforeEach(() => {
    setupBuilder = setup().beforeBuild((buildContext) => {
      viewTest = setupViewTest(buildContext)
      return viewTest
    })
  })

  it('should set initial view as active', () => {
    setupBuilder.build()
    const { getViewUpdate } = viewTest

    expect(getViewUpdate(0).isActive).toBe(true)
  })

  it('should set old view as inactive and new one as active after a route change', () => {
    setupBuilder.build()
    const { getViewUpdate, startView } = viewTest

    startView()

    expect(getViewUpdate(1).isActive).toBe(false)
    expect(getViewUpdate(2).isActive).toBe(true)
  })
})

describe('view custom timings', () => {
  let setupBuilder: TestSetupBuilder
  let viewTest: ViewTest

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeClock()
      .beforeBuild((buildContext) => {
        viewTest = setupViewTest(buildContext)
        return viewTest
      })
  })

  it('should add custom timing to current view', () => {
    const { clock } = setupBuilder.build()
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
    const { clock } = setupBuilder.build()
    const { getViewUpdate, addTiming } = viewTest

    clock.tick(20)
    addTiming('foo')

    clock.tick(10)
    addTiming('bar')

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    const view = getViewUpdate(1)
    expect(view.customTimings).toEqual({
      bar: 30 as Duration,
      foo: 20 as Duration,
    })
  })

  it('should update custom timing', () => {
    const { clock } = setupBuilder.build()
    const { getViewUpdate, addTiming } = viewTest

    clock.tick(20)
    addTiming('foo')

    clock.tick(10)
    addTiming('bar')

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    let view = getViewUpdate(1)
    expect(view.customTimings).toEqual({
      bar: 30 as Duration,
      foo: 20 as Duration,
    })

    clock.tick(20)
    addTiming('foo')

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    view = getViewUpdate(2)
    expect(view.customTimings).toEqual({
      bar: 30 as Duration,
      foo: (THROTTLE_VIEW_UPDATE_PERIOD + 50) as Duration,
    })
  })

  it('should add custom timing with a specific timestamp', () => {
    const { clock } = setupBuilder.build()
    const { getViewUpdate, addTiming } = viewTest

    clock.tick(1234)
    addTiming('foo', timeStampNow())

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdate(1).customTimings).toEqual({
      foo: 1234 as Duration,
    })
  })

  it('should add custom timing with a specific relative time', () => {
    const { clock } = setupBuilder.build()
    const { getViewUpdate, addTiming } = viewTest

    clock.tick(1234)
    addTiming('foo', relativeNow())

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdate(1).customTimings).toEqual({
      foo: 1234 as Duration,
    })
  })

  it('should sanitized timing name', () => {
    const { clock } = setupBuilder.build()
    const { getViewUpdate, addTiming } = viewTest

    const displaySpy = spyOn(display, 'warn')

    clock.tick(1234)
    addTiming('foo bar-qux.@zip_21%$*€👋', timeStampNow())

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdate(1).customTimings).toEqual({
      'foo_bar-qux.@zip_21_$____': 1234 as Duration,
    })
    expect(displaySpy).toHaveBeenCalled()
  })

  it('should not add custom timing when the session has expired', () => {
    const { clock, lifeCycle } = setupBuilder.build()
    const { getViewUpdateCount, addTiming } = viewTest

    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

    expect(getViewUpdateCount()).toBe(2)

    addTiming('foo', relativeNow())

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdateCount()).toBe(2)
  })
})

describe('start view', () => {
  let setupBuilder: TestSetupBuilder
  let viewTest: ViewTest

  beforeEach(() => {
    setupBuilder = setup().beforeBuild((buildContext) => {
      viewTest = setupViewTest(buildContext)
      return viewTest
    })
  })

  it('should start a new view', () => {
    const { clock } = setupBuilder.withFakeClock().build()
    const { getViewUpdateCount, getViewUpdate, startView } = viewTest

    expect(getViewUpdateCount()).toBe(1)
    const initialViewId = getViewUpdate(0).id

    clock.tick(10)
    startView()

    expect(getViewUpdateCount()).toBe(3)

    expect(getViewUpdate(1).id).toBe(initialViewId)
    expect(getViewUpdate(1).isActive).toBe(false)
    expect(getViewUpdate(1).startClocks.relative).toBe(0 as RelativeTime)
    expect(getViewUpdate(1).duration).toBe(10 as Duration)

    expect(getViewUpdate(2).id).not.toBe(initialViewId)
    expect(getViewUpdate(2).isActive).toBe(true)
    expect(getViewUpdate(2).startClocks.relative).toBe(10 as RelativeTime)
  })

  it('should name the view', () => {
    setupBuilder.build()
    const { getViewUpdate, startView } = viewTest

    startView()
    startView({ name: 'foo' })
    startView({ name: 'bar' })

    expect(getViewUpdate(2).name).toBeUndefined()
    expect(getViewUpdate(4).name).toBe('foo')
    expect(getViewUpdate(6).name).toBe('bar')
  })

  it('should have service and version', () => {
    setupBuilder.build()
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
    setupBuilder.build()
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
    const { clock } = setupBuilder.withFakeClock().build()
    const { getViewUpdate, startView } = viewTest

    clock.tick(100)
    startView({ name: 'foo' }, relativeToClocks(50 as RelativeTime))

    expect(getViewUpdate(1).duration).toBe(50 as Duration)
    expect(getViewUpdate(2).startClocks.relative).toBe(50 as RelativeTime)
  })
})

describe('view event count', () => {
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

  it('should be updated when notified with a RUM_EVENT_COLLECTED event', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
    const { getViewUpdate, getViewUpdateCount } = viewTest

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, createFakeActionEvent())

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdate(getViewUpdateCount() - 1).eventCounts.actionCount).toBe(1)
  })

  it('should take child events occurring on view end into account', () => {
    const { lifeCycle } = setupBuilder.build()
    const { getViewUpdate, getViewUpdateCount } = viewTest

    lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, createFakeActionEvent())
    })

    lifeCycle.notify(LifeCycleEventType.PAGE_EXITED, { reason: PageExitReason.UNLOADING })

    expect(getViewUpdate(getViewUpdateCount() - 1).eventCounts.actionCount).toBe(1)
  })

  it('should be updated for 5 min after view end', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
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
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
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

  describe('update view name', () => {
    let setupBuilder: TestSetupBuilder
    let viewTest: ViewTest

    beforeEach(() => {
      setupBuilder = setup().beforeBuild((buildContext) => {
        viewTest = setupViewTest(buildContext)
        return viewTest
      })
    })

    it('should update an undefined view name if the experimental feature is enabled', () => {
      mockExperimentalFeatures([ExperimentalFeature.UPDATE_VIEW_NAME])
      setupBuilder.build()
      const { getViewUpdate, startView, updateViewName } = viewTest

      startView()
      updateViewName('foo')
      expect(getViewUpdate(3).name).toEqual('foo')
    })

    it('should update a defined view name if the experimental feature is enabled', () => {
      mockExperimentalFeatures([ExperimentalFeature.UPDATE_VIEW_NAME])
      setupBuilder.build()
      const { getViewUpdate, startView, updateViewName } = viewTest

      startView({ name: 'initial view name' })
      updateViewName('foo')
      expect(getViewUpdate(3).name).toEqual('foo')
    })

    it('should not update a defined view name if the experimental feature is not enabled', () => {
      setupBuilder.build()
      const { getViewUpdate, startView, updateViewName } = viewTest

      startView({ name: 'initial view name' })
      updateViewName('foo')
      expect(getViewUpdate(2).name).toEqual('initial view name')
    })
  })
})
