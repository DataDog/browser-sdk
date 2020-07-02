import { getHash, getPathName, getSearch } from '@datadog/browser-core'

import { LifeCycleEventType } from '../src/lifeCycle'
import { PerformanceLongTaskTiming, PerformancePaintTiming } from '../src/rum'

import {
  PAGE_ACTIVITY_END_DELAY,
  PAGE_ACTIVITY_MAX_DURATION,
  PAGE_ACTIVITY_VALIDATION_DELAY,
} from '../src/trackPageActivities'
import { UserAction, UserActionType } from '../src/userActionCollection'
import { THROTTLE_VIEW_UPDATE_PERIOD, View, ViewContext, ViewLoadingType } from '../src/viewCollection'
import { setup, TestSetupBuilder } from './specHelper'

const AFTER_PAGE_ACTIVITY_MAX_DURATION = PAGE_ACTIVITY_MAX_DURATION * 1.1
const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = PAGE_ACTIVITY_VALIDATION_DELAY * 0.8
const AFTER_PAGE_ACTIVITY_END_DELAY = PAGE_ACTIVITY_END_DELAY * 1.1

const FAKE_LONG_TASK = {
  entryType: 'longtask',
  startTime: 456,
}
const FAKE_USER_ACTION = {
  context: {
    bar: 123,
  },
  name: 'foo',
  type: UserActionType.CUSTOM,
}
const FAKE_PAINT_ENTRY = {
  entryType: 'paint',
  name: 'first-contentful-paint',
  startTime: 123,
}
const FAKE_NAVIGATION_ENTRY = {
  domComplete: 456,
  domContentLoadedEventEnd: 345,
  domInteractive: 234,
  entryType: 'navigation',
  loadEventEnd: 567,
}

const FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_BEFORE_ACTIVITY_TIMING = {
  domComplete: 2,
  domContentLoadedEventEnd: 1,
  domInteractive: 1,
  entryType: 'navigation',
  loadEventEnd: BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY * 0.8,
}

const FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_AFTER_ACTIVITY_TIMING = {
  domComplete: 2,
  domContentLoadedEventEnd: 1,
  domInteractive: 1,
  entryType: 'navigation',
  loadEventEnd: BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY * 1.2,
}

function mockHistory(location: Partial<Location>) {
  spyOn(history, 'pushState').and.callFake((_: any, __: string, pathname: string) => {
    const url = `http://localhost${pathname}`
    location.pathname = getPathName(url)
    location.search = getSearch(url)
    location.hash = getHash(url)
  })
}

function spyOnViews() {
  const addRumEvent = jasmine.createSpy()

  function getViewEvent(index: number) {
    return addRumEvent.calls.argsFor(index)[0] as View
  }

  function getRumEventCount() {
    return addRumEvent.calls.count()
  }

  return { addRumEvent, getViewEvent, getRumEventCount }
}

describe('rum track url change', () => {
  let setupBuilder: TestSetupBuilder
  let initialViewId: string
  let initialLocation: Location
  let createSpy: jasmine.Spy

  beforeEach(() => {
    const fakeLocation: Partial<Location> = { pathname: '/foo' }
    mockHistory(fakeLocation)
    setupBuilder = setup()
      .withViewCollection(fakeLocation)
      .beforeBuild((lifeCycle) => {
        const subscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (viewContext) => {
          initialViewId = viewContext.id
          initialLocation = viewContext.location
          subscription.unsubscribe()
        })
      })
    createSpy = jasmine.createSpy('create')
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should create new view on path change', () => {
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    history.pushState({}, '', '/bar')

    expect(createSpy).toHaveBeenCalled()
    const viewContext = createSpy.calls.argsFor(0)[0] as ViewContext
    expect(viewContext.id).not.toEqual(initialViewId)
    expect(viewContext.location).not.toEqual(initialLocation)
  })

  it('should not create new view on search change', () => {
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    history.pushState({}, '', '/foo?bar=qux')

    expect(createSpy).not.toHaveBeenCalled()
  })

  it('should not create a new view on hash change', () => {
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    history.pushState({}, '', '/foo#bar')

    expect(createSpy).not.toHaveBeenCalled()
  })
})

describe('rum track renew session', () => {
  let setupBuilder: TestSetupBuilder
  let addRumEvent: jasmine.Spy
  let initialViewId: string
  let getRumEventCount: () => number
  let getViewEvent: (index: number) => View

  beforeEach(() => {
    ;({ addRumEvent, getViewEvent, getRumEventCount } = spyOnViews())

    const fakeLocation: Partial<Location> = { pathname: '/foo' }
    mockHistory(fakeLocation)
    setupBuilder = setup()
      .withViewCollection(fakeLocation)
      .beforeBuild((lifeCycle) => {
        lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, addRumEvent)
        const subscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (viewContext) => {
          initialViewId = viewContext.id
          subscription.unsubscribe()
        })
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should create new view on renew session', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (viewContext) => {
      expect(viewContext.id).not.toEqual(initialViewId)
    })

    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
  })

  it('should send a final view event when the session is renewed', () => {
    const { lifeCycle } = setupBuilder.build()
    expect(getRumEventCount()).toEqual(1)

    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
    expect(getRumEventCount()).toEqual(2)
    expect(getViewEvent(0).id).not.toBe(getViewEvent(1).id)
  })
})

describe('rum track load duration', () => {
  let setupBuilder: TestSetupBuilder
  let addRumEvent: jasmine.Spy
  let getViewEvent: (index: number) => View

  beforeEach(() => {
    ;({ addRumEvent, getViewEvent } = spyOnViews())

    const fakeLocation: Partial<Location> = { pathname: '/foo' }
    mockHistory(fakeLocation)
    setupBuilder = setup()
      .withFakeClock()
      .withViewCollection(fakeLocation)
      .beforeBuild((lifeCycle) => lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, addRumEvent))
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should collect initial view type as "initial_load"', () => {
    setupBuilder.build()
    expect(getViewEvent(0).loadingType).toEqual(ViewLoadingType.INITIAL_LOAD)
  })

  it('should collect view type as "route_change" after a route change', () => {
    setupBuilder.build()
    history.pushState({}, '', '/bar')
    expect(getViewEvent(1).location.pathname).toEqual('/foo')
    expect(getViewEvent(1).loadingType).toEqual(ViewLoadingType.INITIAL_LOAD)

    expect(getViewEvent(2).location.pathname).toEqual('/bar')
    expect(getViewEvent(2).loadingType).toEqual(ViewLoadingType.ROUTE_CHANGE)
  })
})

describe('rum track loading time', () => {
  let setupBuilder: TestSetupBuilder
  let addRumEvent: jasmine.Spy
  let getViewEvent: (index: number) => View
  let getRumEventCount: () => number

  beforeEach(() => {
    ;({ addRumEvent, getRumEventCount, getViewEvent } = spyOnViews())

    const fakeLocation: Partial<Location> = { pathname: '/foo' }
    mockHistory(fakeLocation)
    setupBuilder = setup()
      .withFakeClock()
      .withViewCollection(fakeLocation)
      .beforeBuild((lifeCycle) => lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, addRumEvent))
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should have an undefined loading time if there is no activity on a route change', () => {
    const { clock } = setupBuilder.build()

    history.pushState({}, '', '/bar')
    clock.tick(AFTER_PAGE_ACTIVITY_MAX_DURATION)
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getRumEventCount()).toEqual(3)
    expect(getViewEvent(2).loadingTime).toBeUndefined()
  })

  it('should have a loading time equal to the activity time if there is a unique activity on a route change', () => {
    const { lifeCycle, clock } = setupBuilder.build()

    history.pushState({}, '', '/bar')
    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getViewEvent(3).loadingTime).toEqual(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
  })

  it('should use loadEventEnd for initial view when having no activity', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    expect(getRumEventCount()).toEqual(1)

    lifeCycle.notify(
      LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
      FAKE_NAVIGATION_ENTRY as PerformanceNavigationTiming
    )
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getRumEventCount()).toEqual(2)
    expect(getViewEvent(1).loadingTime).toEqual(FAKE_NAVIGATION_ENTRY.loadEventEnd)
  })

  it('should use loadEventEnd for initial view when load event is bigger than computed loading time', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    expect(getRumEventCount()).toEqual(1)

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)

    lifeCycle.notify(
      LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
      FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_AFTER_ACTIVITY_TIMING as PerformanceNavigationTiming
    )

    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getRumEventCount()).toEqual(2)
    expect(getViewEvent(1).loadingTime).toEqual(FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_AFTER_ACTIVITY_TIMING.loadEventEnd)
  })

  it('should use computed loading time for initial view when load event is smaller than computed loading time', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    expect(getRumEventCount()).toEqual(1)

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    lifeCycle.notify(
      LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
      FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_BEFORE_ACTIVITY_TIMING as PerformanceNavigationTiming
    )
    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getRumEventCount()).toEqual(2)
    expect(getViewEvent(1).loadingTime).toEqual(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
  })
})

describe('rum view measures', () => {
  let setupBuilder: TestSetupBuilder
  let addRumEvent: jasmine.Spy
  let getRumEventCount: () => number
  let getViewEvent: (index: number) => View

  beforeEach(() => {
    ;({ addRumEvent, getViewEvent, getRumEventCount } = spyOnViews())

    const fakeLocation: Partial<Location> = { pathname: '/foo' }
    mockHistory(fakeLocation)
    setupBuilder = setup()
      .withViewCollection(fakeLocation)
      .beforeBuild((lifeCycle) => lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, addRumEvent))
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should track error count', () => {
    const { lifeCycle } = setupBuilder.build()
    expect(getRumEventCount()).toEqual(1)
    expect(getViewEvent(0).measures.errorCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, {} as any)
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, {} as any)
    history.pushState({}, '', '/bar')

    expect(getRumEventCount()).toEqual(3)
    expect(getViewEvent(1).measures.errorCount).toEqual(2)
    expect(getViewEvent(2).measures.errorCount).toEqual(0)
  })

  it('should track long task count', () => {
    const { lifeCycle } = setupBuilder.build()
    expect(getRumEventCount()).toEqual(1)
    expect(getViewEvent(0).measures.longTaskCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_LONG_TASK as PerformanceLongTaskTiming)
    history.pushState({}, '', '/bar')

    expect(getRumEventCount()).toEqual(3)
    expect(getViewEvent(1).measures.longTaskCount).toEqual(1)
    expect(getViewEvent(2).measures.longTaskCount).toEqual(0)
  })

  it('should track resource count', () => {
    const { lifeCycle } = setupBuilder.build()
    expect(getRumEventCount()).toEqual(1)
    expect(getViewEvent(0).measures.resourceCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
    history.pushState({}, '', '/bar')

    expect(getRumEventCount()).toEqual(3)
    expect(getViewEvent(1).measures.resourceCount).toEqual(1)
    expect(getViewEvent(2).measures.resourceCount).toEqual(0)
  })

  it('should track user action count', () => {
    const { lifeCycle } = setupBuilder.build()
    expect(getRumEventCount()).toEqual(1)
    expect(getViewEvent(0).measures.userActionCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.ACTION_COMPLETED, FAKE_USER_ACTION as UserAction)
    history.pushState({}, '', '/bar')

    expect(getRumEventCount()).toEqual(3)
    expect(getViewEvent(1).measures.userActionCount).toEqual(1)
    expect(getViewEvent(2).measures.userActionCount).toEqual(0)
  })

  it('should reset event count when the view changes', () => {
    const { lifeCycle } = setupBuilder.build()
    expect(getRumEventCount()).toEqual(1)
    expect(getViewEvent(0).measures.resourceCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
    history.pushState({}, '', '/bar')

    expect(getRumEventCount()).toEqual(3)
    expect(getViewEvent(1).measures.resourceCount).toEqual(1)
    expect(getViewEvent(2).measures.resourceCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
    history.pushState({}, '', '/baz')

    expect(getRumEventCount()).toEqual(5)
    expect(getViewEvent(3).measures.resourceCount).toEqual(2)
    expect(getViewEvent(4).measures.resourceCount).toEqual(0)
  })

  it('should update measures when notified with a PERFORMANCE_ENTRY_COLLECTED event (throttled)', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
    expect(getRumEventCount()).toEqual(1)
    expect(getViewEvent(0).measures).toEqual({
      errorCount: 0,
      longTaskCount: 0,
      resourceCount: 0,
      userActionCount: 0,
    })

    lifeCycle.notify(
      LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
      FAKE_NAVIGATION_ENTRY as PerformanceNavigationTiming
    )

    expect(getRumEventCount()).toEqual(1)

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getRumEventCount()).toEqual(2)
    expect(getViewEvent(1).measures).toEqual({
      domComplete: 456e6,
      domContentLoaded: 345e6,
      domInteractive: 234e6,
      errorCount: 0,
      loadEventEnd: 567e6,
      longTaskCount: 0,
      resourceCount: 0,
      userActionCount: 0,
    })
  })

  it('should update measures when notified with a RESOURCE_ADDED_TO_BATCH event (throttled)', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
    expect(getRumEventCount()).toEqual(1)
    expect(getViewEvent(0).measures).toEqual({
      errorCount: 0,
      longTaskCount: 0,
      resourceCount: 0,
      userActionCount: 0,
    })

    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)

    expect(getRumEventCount()).toEqual(1)

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getRumEventCount()).toEqual(2)
    expect(getViewEvent(1).measures).toEqual({
      errorCount: 0,
      longTaskCount: 0,
      resourceCount: 1,
      userActionCount: 0,
    })
  })

  it('should update measures when ending a view', () => {
    const { lifeCycle } = setupBuilder.build()
    expect(getRumEventCount()).toEqual(1)
    expect(getViewEvent(0).measures).toEqual({
      errorCount: 0,
      longTaskCount: 0,
      resourceCount: 0,
      userActionCount: 0,
    })

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_PAINT_ENTRY as PerformancePaintTiming)
    lifeCycle.notify(
      LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
      FAKE_NAVIGATION_ENTRY as PerformanceNavigationTiming
    )
    expect(getRumEventCount()).toEqual(1)

    history.pushState({}, '', '/bar')

    expect(getRumEventCount()).toEqual(3)
    expect(getViewEvent(1).measures).toEqual({
      domComplete: 456e6,
      domContentLoaded: 345e6,
      domInteractive: 234e6,
      errorCount: 0,
      firstContentfulPaint: 123e6,
      loadEventEnd: 567e6,
      longTaskCount: 0,
      resourceCount: 0,
      userActionCount: 0,
    })
    expect(getViewEvent(2).measures).toEqual({
      errorCount: 0,
      longTaskCount: 0,
      resourceCount: 0,
      userActionCount: 0,
    })
  })

  it('should not update measures after ending a view', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
    expect(getRumEventCount()).toEqual(1)

    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)

    expect(getRumEventCount()).toEqual(1)

    history.pushState({}, '', '/bar')

    expect(getRumEventCount()).toEqual(3)
    expect(getViewEvent(1).id).toEqual(getViewEvent(0).id)
    expect(getViewEvent(2).id).not.toEqual(getViewEvent(0).id)

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getRumEventCount()).toEqual(3)
  })
})
