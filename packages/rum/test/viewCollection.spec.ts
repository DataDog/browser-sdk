import { getHash, getPathName, getSearch, noop } from '@datadog/browser-core'

import { LifeCycleEventType } from '../src/lifeCycle'
import { ViewContext } from '../src/parentContexts'
import { PerformanceLongTaskTiming, PerformancePaintTiming } from '../src/rum'

import {
  PAGE_ACTIVITY_END_DELAY,
  PAGE_ACTIVITY_MAX_DURATION,
  PAGE_ACTIVITY_VALIDATION_DELAY,
} from '../src/trackPageActivities'
import { AutoUserAction, CustomUserAction, UserActionType } from '../src/userActionCollection'
import { THROTTLE_VIEW_UPDATE_PERIOD, View, ViewLoadingType } from '../src/viewCollection'
import { setup, TestSetupBuilder } from './specHelper'

const AFTER_PAGE_ACTIVITY_MAX_DURATION = PAGE_ACTIVITY_MAX_DURATION * 1.1
const BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY = PAGE_ACTIVITY_VALIDATION_DELAY * 0.8
const AFTER_PAGE_ACTIVITY_END_DELAY = PAGE_ACTIVITY_END_DELAY * 1.1

const FAKE_LONG_TASK = {
  entryType: 'longtask',
  startTime: 456,
}
const FAKE_CUSTOM_USER_ACTION: CustomUserAction = {
  context: {
    bar: 123,
  },
  name: 'foo',
  type: UserActionType.CUSTOM,
}
const FAKE_AUTO_USER_ACTION: Partial<AutoUserAction> = {
  name: 'foo',
  type: UserActionType.CLICK,
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
    location.hash = getHash(url) || ''
  })
}

function mockHash(location: Partial<Location>) {
  function hashchangeCallBack() {
    location.hash = window.location.hash
  }

  window.addEventListener('hashchange', hashchangeCallBack)

  return () => {
    window.removeEventListener('hashchange', hashchangeCallBack)
    window.location.hash = ''
  }
}

function mockGetElementById() {
  return spyOn(document, 'getElementById').and.callFake((elementId: string) => {
    return (elementId === ('testHashValue' as unknown)) as any
  })
}

function spyOnViews() {
  const handler = jasmine.createSpy()

  function getViewEvent(index: number) {
    return handler.calls.argsFor(index)[0] as View
  }

  function getHandledCount() {
    return handler.calls.count()
  }

  return { handler, getViewEvent, getHandledCount }
}

describe('rum track url change', () => {
  let setupBuilder: TestSetupBuilder
  let initialViewId: string
  let createSpy: jasmine.Spy
  let cleanMockHash: () => void

  beforeEach(() => {
    const fakeLocation: Partial<Location> = { pathname: '/foo', hash: '' }
    mockHistory(fakeLocation)
    cleanMockHash = mockHash(fakeLocation)
    setupBuilder = setup()
      .withFakeLocation(fakeLocation)
      .withViewCollection()
      .beforeBuild((lifeCycle) => {
        const subscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, ({ id }) => {
          initialViewId = id
          subscription.unsubscribe()
        })
      })
    createSpy = jasmine.createSpy('create')
  })

  afterEach(() => {
    setupBuilder.cleanup()
    cleanMockHash()
  })

  it('should create new view on path change', () => {
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    history.pushState({}, '', '/bar')

    expect(createSpy).toHaveBeenCalled()
    const viewContext = createSpy.calls.argsFor(0)[0] as ViewContext
    expect(viewContext.id).not.toEqual(initialViewId)
  })

  it('should create a new view on hash change from history', () => {
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    history.pushState({}, '', '/foo#bar')

    expect(createSpy).toHaveBeenCalled()
    const viewContext = createSpy.calls.argsFor(0)[0] as ViewContext
    expect(viewContext.id).not.toEqual(initialViewId)
  })

  it('should not create a new view on hash change from history when the hash has kept the same value', () => {
    history.pushState({}, '', '/foo#bar')

    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    history.pushState({}, '', '/foo#bar')

    expect(createSpy).not.toHaveBeenCalled()
  })

  it('should create a new view on hash change', (done) => {
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    function hashchangeCallBack() {
      expect(createSpy).toHaveBeenCalled()
      const viewContext = createSpy.calls.argsFor(0)[0] as ViewContext
      expect(viewContext.id).not.toEqual(initialViewId)
      window.removeEventListener('hashchange', hashchangeCallBack)
      done()
    }

    window.addEventListener('hashchange', hashchangeCallBack)

    window.location.hash = '#bar'
  })

  it('should not create a new view when the hash has kept the same value', (done) => {
    history.pushState({}, '', '/foo#bar')

    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    function hashchangeCallBack() {
      expect(createSpy).not.toHaveBeenCalled()
      window.removeEventListener('hashchange', hashchangeCallBack)
      done()
    }

    window.addEventListener('hashchange', hashchangeCallBack)

    window.location.hash = '#bar'
  })

  it('should not create a new view when it is an Anchor navigation', (done) => {
    const { lifeCycle } = setupBuilder.build()
    mockGetElementById()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    function hashchangeCallBack() {
      expect(createSpy).not.toHaveBeenCalled()
      window.removeEventListener('hashchange', hashchangeCallBack)
      done()
    }

    window.addEventListener('hashchange', hashchangeCallBack)

    window.location.hash = '#testHashValue'
  })

  it('should acknowledge the view location hash change after an Anchor navigation', (done) => {
    const { lifeCycle } = setupBuilder.build()
    const spyObj = mockGetElementById()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    function hashchangeCallBack() {
      expect(createSpy).not.toHaveBeenCalled()
      window.removeEventListener('hashchange', hashchangeCallBack)

      // clear mockGetElementById that fake Anchor nav
      spyObj.and.callThrough()

      // This is not an Anchor nav anymore but the hash and pathname have not been updated
      history.pushState({}, '', '/foo#testHashValue')
      expect(createSpy).not.toHaveBeenCalled()
      done()
    }

    window.addEventListener('hashchange', hashchangeCallBack)

    window.location.hash = '#testHashValue'
  })

  it('should not create new view on search change', () => {
    const { lifeCycle } = setupBuilder.build()
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    history.pushState({}, '', '/foo?bar=qux')

    expect(createSpy).not.toHaveBeenCalled()
  })
})

describe('rum track renew session', () => {
  let setupBuilder: TestSetupBuilder
  let handler: jasmine.Spy
  let initialViewId: string
  let getHandledCount: () => number
  let getViewEvent: (index: number) => View

  beforeEach(() => {
    ;({ handler, getViewEvent, getHandledCount } = spyOnViews())

    const fakeLocation: Partial<Location> = { pathname: '/foo' }
    mockHistory(fakeLocation)
    setupBuilder = setup()
      .withFakeLocation(fakeLocation)
      .withViewCollection()
      .beforeBuild((lifeCycle) => {
        lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler)
        const subscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, ({ id }) => {
          initialViewId = id
          subscription.unsubscribe()
        })
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should create new view on renew session', () => {
    const { lifeCycle } = setupBuilder.build()
    const createSpy = jasmine.createSpy('create')
    lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, createSpy)

    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    expect(createSpy).toHaveBeenCalled()
    const viewContext = createSpy.calls.argsFor(0)[0] as ViewContext
    expect(viewContext.id).not.toEqual(initialViewId)
  })

  it('should send a final view event when the session is renewed', () => {
    const { lifeCycle } = setupBuilder.build()
    expect(getHandledCount()).toEqual(1)

    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
    expect(getHandledCount()).toEqual(2)
    expect(getViewEvent(0).id).not.toBe(getViewEvent(1).id)
  })
})

describe('rum track load duration', () => {
  let setupBuilder: TestSetupBuilder
  let handler: jasmine.Spy
  let getViewEvent: (index: number) => View

  beforeEach(() => {
    ;({ handler, getViewEvent } = spyOnViews())

    const fakeLocation: Partial<Location> = { pathname: '/foo' }
    mockHistory(fakeLocation)
    setupBuilder = setup()
      .withFakeClock()
      .withFakeLocation(fakeLocation)
      .withViewCollection()
      .beforeBuild((lifeCycle) => lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler))
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
  let handler: jasmine.Spy
  let getViewEvent: (index: number) => View
  let getHandledCount: () => number

  beforeEach(() => {
    ;({ handler, getHandledCount, getViewEvent } = spyOnViews())

    const fakeLocation: Partial<Location> = { pathname: '/foo' }
    mockHistory(fakeLocation)
    setupBuilder = setup()
      .withFakeClock()
      .withFakeLocation(fakeLocation)
      .withViewCollection()
      .beforeBuild((lifeCycle) => lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler))
  })

  afterEach(() => {
    setupBuilder.cleanup()
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
    expect(getHandledCount()).toEqual(1)

    lifeCycle.notify(
      LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
      FAKE_NAVIGATION_ENTRY as PerformanceNavigationTiming
    )
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getHandledCount()).toEqual(2)
    expect(getViewEvent(1).loadingTime).toEqual(FAKE_NAVIGATION_ENTRY.loadEventEnd)
  })

  it('should use loadEventEnd for initial view when load event is bigger than computed loading time', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    expect(getHandledCount()).toEqual(1)

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)

    lifeCycle.notify(
      LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
      FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_AFTER_ACTIVITY_TIMING as PerformanceNavigationTiming
    )

    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getHandledCount()).toEqual(2)
    expect(getViewEvent(1).loadingTime).toEqual(FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_AFTER_ACTIVITY_TIMING.loadEventEnd)
  })

  it('should use computed loading time for initial view when load event is smaller than computed loading time', () => {
    const { lifeCycle, clock } = setupBuilder.build()
    expect(getHandledCount()).toEqual(1)

    clock.tick(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
    lifeCycle.notify(
      LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED,
      FAKE_NAVIGATION_ENTRY_WITH_LOADEVENT_BEFORE_ACTIVITY_TIMING as PerformanceNavigationTiming
    )
    lifeCycle.notify(LifeCycleEventType.DOM_MUTATED)
    clock.tick(AFTER_PAGE_ACTIVITY_END_DELAY)
    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getHandledCount()).toEqual(2)
    expect(getViewEvent(1).loadingTime).toEqual(BEFORE_PAGE_ACTIVITY_VALIDATION_DELAY)
  })
})

describe('rum view measures', () => {
  let setupBuilder: TestSetupBuilder
  let handler: jasmine.Spy
  let getHandledCount: () => number
  let getViewEvent: (index: number) => View

  beforeEach(() => {
    ;({ handler, getViewEvent, getHandledCount } = spyOnViews())

    const fakeLocation: Partial<Location> = { pathname: '/foo' }
    mockHistory(fakeLocation)
    setupBuilder = setup()
      .withFakeLocation(fakeLocation)
      .withViewCollection()
      .beforeBuild((lifeCycle) => lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, handler))
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should track error count', () => {
    const { lifeCycle } = setupBuilder.build()
    expect(getHandledCount()).toEqual(1)
    expect(getViewEvent(0).measures.errorCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, {} as any)
    lifeCycle.notify(LifeCycleEventType.ERROR_COLLECTED, {} as any)
    history.pushState({}, '', '/bar')

    expect(getHandledCount()).toEqual(3)
    expect(getViewEvent(1).measures.errorCount).toEqual(2)
    expect(getViewEvent(2).measures.errorCount).toEqual(0)
  })

  it('should track long task count', () => {
    const { lifeCycle } = setupBuilder.build()
    expect(getHandledCount()).toEqual(1)
    expect(getViewEvent(0).measures.longTaskCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_LONG_TASK as PerformanceLongTaskTiming)
    history.pushState({}, '', '/bar')

    expect(getHandledCount()).toEqual(3)
    expect(getViewEvent(1).measures.longTaskCount).toEqual(1)
    expect(getViewEvent(2).measures.longTaskCount).toEqual(0)
  })

  it('should track resource count', () => {
    const { lifeCycle } = setupBuilder.build()
    expect(getHandledCount()).toEqual(1)
    expect(getViewEvent(0).measures.resourceCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
    history.pushState({}, '', '/bar')

    expect(getHandledCount()).toEqual(3)
    expect(getViewEvent(1).measures.resourceCount).toEqual(1)
    expect(getViewEvent(2).measures.resourceCount).toEqual(0)
  })

  it('should track user action count', () => {
    const { lifeCycle } = setupBuilder.build()
    expect(getHandledCount()).toEqual(1)
    expect(getViewEvent(0).measures.userActionCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.CUSTOM_ACTION_COLLECTED, FAKE_CUSTOM_USER_ACTION)
    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, FAKE_AUTO_USER_ACTION as AutoUserAction)
    history.pushState({}, '', '/bar')

    expect(getHandledCount()).toEqual(3)
    expect(getViewEvent(1).measures.userActionCount).toEqual(2)
    expect(getViewEvent(2).measures.userActionCount).toEqual(0)
  })

  it('should reset event count when the view changes', () => {
    const { lifeCycle } = setupBuilder.build()
    expect(getHandledCount()).toEqual(1)
    expect(getViewEvent(0).measures.resourceCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
    history.pushState({}, '', '/bar')

    expect(getHandledCount()).toEqual(3)
    expect(getViewEvent(1).measures.resourceCount).toEqual(1)
    expect(getViewEvent(2).measures.resourceCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
    history.pushState({}, '', '/baz')

    expect(getHandledCount()).toEqual(5)
    expect(getViewEvent(3).measures.resourceCount).toEqual(2)
    expect(getViewEvent(4).measures.resourceCount).toEqual(0)
  })

  it('should update measures when notified with a PERFORMANCE_ENTRY_COLLECTED event (throttled)', () => {
    const { lifeCycle, clock } = setupBuilder.withFakeClock().build()
    expect(getHandledCount()).toEqual(1)
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

    expect(getHandledCount()).toEqual(1)

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getHandledCount()).toEqual(2)
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
    expect(getHandledCount()).toEqual(1)
    expect(getViewEvent(0).measures).toEqual({
      errorCount: 0,
      longTaskCount: 0,
      resourceCount: 0,
      userActionCount: 0,
    })

    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)

    expect(getHandledCount()).toEqual(1)

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getHandledCount()).toEqual(2)
    expect(getViewEvent(1).measures).toEqual({
      errorCount: 0,
      longTaskCount: 0,
      resourceCount: 1,
      userActionCount: 0,
    })
  })

  it('should update measures when ending a view', () => {
    const { lifeCycle } = setupBuilder.build()
    expect(getHandledCount()).toEqual(1)
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
    expect(getHandledCount()).toEqual(1)

    history.pushState({}, '', '/bar')

    expect(getHandledCount()).toEqual(3)
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
    expect(getHandledCount()).toEqual(1)

    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)

    expect(getHandledCount()).toEqual(1)

    history.pushState({}, '', '/bar')

    expect(getHandledCount()).toEqual(3)
    expect(getViewEvent(1).id).toEqual(getViewEvent(0).id)
    expect(getViewEvent(2).id).not.toEqual(getViewEvent(0).id)

    clock.tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getHandledCount()).toEqual(3)
  })
})
