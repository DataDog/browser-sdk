import { getHash, getPathName, getSearch } from '@datadog/browser-core'

import { LifeCycle, LifeCycleEventType } from '../src/lifeCycle'
import { PerformanceLongTaskTiming, PerformancePaintTiming } from '../src/rum'
import { RumSession } from '../src/rumSession'
import { UserAction, UserActionType } from '../src/userActionCollection'
import { startViewCollection, THROTTLE_VIEW_UPDATE_PERIOD, View, viewContext } from '../src/viewCollection'

function setup(lifeCycle: LifeCycle = new LifeCycle()) {
  spyOn(history, 'pushState').and.callFake((_: any, __: string, pathname: string) => {
    const url = `http://localhost${pathname}`
    fakeLocation.pathname = getPathName(url)
    fakeLocation.search = getSearch(url)
    fakeLocation.hash = getHash(url)
  })
  const fakeLocation: Partial<Location> = { pathname: '/foo' }
  const fakeSession = {
    getId() {
      return '42'
    },
  }
  startViewCollection(fakeLocation as Location, lifeCycle, fakeSession as RumSession)
}

describe('rum track url change', () => {
  let initialView: string
  let initialLocation: Location

  beforeEach(() => {
    setup()
    initialView = viewContext.id
    initialLocation = viewContext.location
  })

  it('should update view id on path change', () => {
    history.pushState({}, '', '/bar')

    expect(viewContext.id).not.toEqual(initialView)
    expect(viewContext.location).not.toEqual(initialLocation)
  })

  it('should not update view id on search change', () => {
    history.pushState({}, '', '/foo?bar=qux')

    expect(viewContext.id).toEqual(initialView)
    expect(viewContext.location).toEqual(initialLocation)
  })

  it('should not update view id on hash change', () => {
    history.pushState({}, '', '/foo#bar')

    expect(viewContext.id).toEqual(initialView)
    expect(viewContext.location).toEqual(initialLocation)
  })
})

function spyOnViews() {
  let addRumEvent: jasmine.Spy
  let lifeCycle: LifeCycle

  function getViewEvent(index: number) {
    return addRumEvent.calls.argsFor(index)[0] as View
  }

  function getRumEventCount() {
    return addRumEvent.calls.count()
  }

  addRumEvent = jasmine.createSpy()
  lifeCycle = new LifeCycle()
  lifeCycle.subscribe(LifeCycleEventType.VIEW_COLLECTED, addRumEvent)
  setup(lifeCycle)

  return { lifeCycle, getViewEvent, getRumEventCount }
}

describe('rum track renew session', () => {
  let lifeCycle: LifeCycle
  let getRumEventCount: () => number
  let getViewEvent: (index: number) => View
  beforeEach(() => {
    ;({ lifeCycle, getRumEventCount, getViewEvent } = spyOnViews())
  })

  it('should update page view id on renew session', () => {
    const initialView = viewContext.id
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    expect(viewContext.id).not.toEqual(initialView)
  })

  it('should send a final view event when the session is renewed', () => {
    expect(getRumEventCount()).toEqual(1)

    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
    expect(getViewEvent(0).id).toBe(getViewEvent(1).id)
    expect(getViewEvent(0).id).not.toBe(getViewEvent(2).id)
    expect(getRumEventCount()).toEqual(3)
  })
})

describe('rum view measures', () => {
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
  let lifeCycle: LifeCycle
  let getRumEventCount: () => number
  let getViewEvent: (index: number) => View
  beforeEach(() => {
    ;({ lifeCycle, getRumEventCount, getViewEvent } = spyOnViews())
  })

  it('should track error count', () => {
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
    expect(getRumEventCount()).toEqual(1)
    expect(getViewEvent(0).measures.longTaskCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, FAKE_LONG_TASK as PerformanceLongTaskTiming)
    history.pushState({}, '', '/bar')

    expect(getRumEventCount()).toEqual(3)
    expect(getViewEvent(1).measures.longTaskCount).toEqual(1)
    expect(getViewEvent(2).measures.longTaskCount).toEqual(0)
  })

  it('should track resource count', () => {
    expect(getRumEventCount()).toEqual(1)
    expect(getViewEvent(0).measures.resourceCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)
    history.pushState({}, '', '/bar')

    expect(getRumEventCount()).toEqual(3)
    expect(getViewEvent(1).measures.resourceCount).toEqual(1)
    expect(getViewEvent(2).measures.resourceCount).toEqual(0)
  })

  it('should track user action count', () => {
    expect(getRumEventCount()).toEqual(1)
    expect(getViewEvent(0).measures.userActionCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.USER_ACTION_COLLECTED, FAKE_USER_ACTION as UserAction)
    history.pushState({}, '', '/bar')

    expect(getRumEventCount()).toEqual(3)
    expect(getViewEvent(1).measures.userActionCount).toEqual(1)
    expect(getViewEvent(2).measures.userActionCount).toEqual(0)
  })

  it('should reset event count when the view changes', () => {
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
    jasmine.clock().install()
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

    jasmine.clock().tick(THROTTLE_VIEW_UPDATE_PERIOD)

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

    jasmine.clock().uninstall()
  })

  it('should update measures when notified with a RESOURCE_ADDED_TO_BATCH event (throttled)', () => {
    jasmine.clock().install()
    expect(getRumEventCount()).toEqual(1)
    expect(getViewEvent(0).measures).toEqual({
      errorCount: 0,
      longTaskCount: 0,
      resourceCount: 0,
      userActionCount: 0,
    })

    lifeCycle.notify(LifeCycleEventType.RESOURCE_ADDED_TO_BATCH)

    expect(getRumEventCount()).toEqual(1)

    jasmine.clock().tick(THROTTLE_VIEW_UPDATE_PERIOD)

    expect(getRumEventCount()).toEqual(2)
    expect(getViewEvent(1).measures).toEqual({
      errorCount: 0,
      longTaskCount: 0,
      resourceCount: 1,
      userActionCount: 0,
    })

    jasmine.clock().uninstall()
  })

  it('should update measures when ending a view', () => {
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
})
