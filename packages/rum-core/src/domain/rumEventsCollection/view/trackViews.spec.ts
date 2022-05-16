import type { Context, Duration, RelativeTime } from '@datadog/browser-core'
import {
  timeStampNow,
  display,
  relativeToClocks,
  relativeNow,
  resetExperimentalFeatures,
  updateExperimentalFeatures,
} from '@datadog/browser-core'
import type { TestSetupBuilder, ViewTest } from '../../../../test/specHelper'
import { setup, setupViewTest } from '../../../../test/specHelper'
import type {
  RumLargestContentfulPaintTiming,
  RumPerformanceNavigationTiming,
  RumPerformancePaintTiming,
} from '../../../browser/performanceCollection'
import { RumEventType, ViewLoadingType } from '../../../rawRumEvent.types'
import type { RumEvent } from '../../../rumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
import type { ViewEvent } from './trackViews'
import { THROTTLE_VIEW_UPDATE_PERIOD } from './trackViews'

const FAKE_PAINT_ENTRY: RumPerformancePaintTiming = {
  entryType: 'paint',
  name: 'first-contentful-paint',
  startTime: 123 as RelativeTime,
}
const FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY: RumLargestContentfulPaintTiming = {
  entryType: 'largest-contentful-paint',
  startTime: 789 as RelativeTime,
  size: 10,
}
const FAKE_NAVIGATION_ENTRY: RumPerformanceNavigationTiming = {
  domComplete: 456 as RelativeTime,
  domContentLoadedEventEnd: 345 as RelativeTime,
  domInteractive: 234 as RelativeTime,
  entryType: 'navigation',
  loadEventEnd: 567 as RelativeTime,
}

describe('track views automatically', () => {
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

describe('initial view', () => {
  let setupBuilder: TestSetupBuilder
  let viewTest: ViewTest

  beforeEach(() => {
    setupBuilder = setup().beforeBuild((buildContext) => {
      viewTest = setupViewTest(buildContext, { name: 'initial view name' })
      return viewTest
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should be created on start', () => {
    setupBuilder.build()
    const { getViewCreate, getViewCreateCount } = viewTest

    expect(getViewCreateCount()).toBe(1)
    expect(getViewCreate(0).name).toBe('initial view name')
  })

  describe('timings', () => {
    it('should update timings when notified with a PERFORMANCE_ENTRY_COLLECTED event (throttled)', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
      const { getViewUpdateCount, getViewUpdate } = viewTest

      expect(getViewUpdateCount()).toEqual(1)
      expect(getViewUpdate(0).timings).toEqual({})

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_NAVIGATION_ENTRY])

      expect(getViewUpdateCount()).toEqual(1)

      clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

      expect(getViewUpdateCount()).toEqual(2)
      expect(getViewUpdate(1).timings).toEqual({
        domComplete: 456 as Duration,
        domContentLoaded: 345 as Duration,
        domInteractive: 234 as Duration,
        loadEvent: 567 as Duration,
      })
    })

    it('should update timings when ending a view', () => {
      const { lifeCycle } = setupBuilder.build()
      const { getViewUpdateCount, getViewUpdate, startView } = viewTest

      expect(getViewUpdateCount()).toEqual(1)
      expect(getViewUpdate(0).timings).toEqual({})

      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
        FAKE_PAINT_ENTRY,
        FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY,
        FAKE_NAVIGATION_ENTRY,
      ])
      expect(getViewUpdateCount()).toEqual(1)

      startView()

      expect(getViewUpdateCount()).toEqual(3)
      expect(getViewUpdate(1).timings).toEqual({
        domComplete: 456 as Duration,
        domContentLoaded: 345 as Duration,
        domInteractive: 234 as Duration,
        firstContentfulPaint: 123 as Duration,
        largestContentfulPaint: 789 as Duration,
        loadEvent: 567 as Duration,
      })
      expect(getViewUpdate(2).timings).toEqual({})
    })

    describe('load event happening after initial view end', () => {
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
          FAKE_PAINT_ENTRY,
          FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY,
          FAKE_NAVIGATION_ENTRY,
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

      it('should not set timings to the second view', () => {
        expect(secondView.last.timings).toEqual({})
      })

      it('should set timings only on the initial view', () => {
        expect(initialView.last.timings).toEqual({
          domComplete: 456 as Duration,
          domContentLoaded: 345 as Duration,
          domInteractive: 234 as Duration,
          firstContentfulPaint: 123 as Duration,
          largestContentfulPaint: 789 as Duration,
          loadEvent: 567 as Duration,
        })
      })

      it('should not update the initial view duration when updating it with new timings', () => {
        expect(initialView.end.duration).toBe(VIEW_DURATION)
        expect(initialView.last.duration).toBe(VIEW_DURATION)
      })

      it('should update the initial view loadingTime following the loadEventEnd value', () => {
        expect(initialView.last.loadingTime).toBe(FAKE_NAVIGATION_ENTRY.loadEventEnd)
      })
    })
  })
})

describe('renew session', () => {
  let setupBuilder: TestSetupBuilder
  let viewTest: ViewTest

  beforeEach(() => {
    setupBuilder = setup()
      .withFakeLocation('/foo')
      .beforeBuild((buildContext) => {
        viewTest = setupViewTest(buildContext, {
          name: 'initial view name',
          service: 'initial service',
          version: 'initial version',
        })
        return viewTest
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should create new view on renew session', () => {
    const { lifeCycle } = setupBuilder.build()
    const { getViewCreateCount } = viewTest

    expect(getViewCreateCount()).toBe(1)

    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    expect(getViewCreateCount()).toBe(2)
  })

  it('should use the current view name, service and version for the new view', () => {
    updateExperimentalFeatures(['sub-apps'])
    const { lifeCycle, changeLocation } = setupBuilder.build()
    const { getViewCreateCount, getViewCreate, startView } = viewTest

    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    startView({ name: 'view 1', service: 'service 1', version: 'version 1' })
    startView({ name: 'view 2', service: 'service 2', version: 'version 2' })
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    startView({ name: 'view 3', service: 'service 3', version: 'version 3' })
    changeLocation('/bar')
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
    resetExperimentalFeatures()
  })

  it('should not update the current view when the session is renewed', () => {
    const { lifeCycle } = setupBuilder.build()
    const { getViewUpdateCount, getViewUpdate } = viewTest

    expect(getViewUpdateCount()).toEqual(1)

    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    expect(getViewUpdateCount()).toEqual(2)
    expect(getViewUpdate(0).id).not.toBe(getViewUpdate(1).id)
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

  afterEach(() => {
    setupBuilder.cleanup()
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

describe('view is active', () => {
  let setupBuilder: TestSetupBuilder
  let viewTest: ViewTest

  beforeEach(() => {
    setupBuilder = setup().beforeBuild((buildContext) => {
      viewTest = setupViewTest(buildContext)
      return viewTest
    })
  })

  afterEach(() => {
    setupBuilder.cleanup()
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

  afterEach(() => {
    setupBuilder.cleanup()
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

  afterEach(() => {
    setupBuilder.cleanup()
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
    updateExperimentalFeatures(['sub-apps'])

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
    resetExperimentalFeatures()
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

describe('view metrics', () => {
  let setupBuilder: TestSetupBuilder
  let viewTest: ViewTest
  const FAKE_ACTION_EVENT = {
    type: RumEventType.ACTION,
    action: {},
  } as RumEvent & Context

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

  it('includes event counts', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
    const { getViewUpdate, getViewUpdateCount } = viewTest

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, FAKE_ACTION_EVENT)

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewUpdate(getViewUpdateCount() - 1).eventCounts.actionCount).toBe(1)
  })

  it('takes child events occurring on view end into account', () => {
    const { lifeCycle } = setupBuilder.build()
    const { getViewUpdate, getViewUpdateCount } = viewTest

    lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, FAKE_ACTION_EVENT)
    })

    lifeCycle.notify(LifeCycleEventType.BEFORE_UNLOAD)

    expect(getViewUpdate(getViewUpdateCount() - 1).eventCounts.actionCount).toBe(1)
  })
})
