import { LifeCycle, LifeCycleEventType } from '../src/lifeCycle'
import { PerformanceLongTaskTiming, PerformancePaintTiming, RumEvent, RumViewEvent, UserAction } from '../src/rum'
import { trackView, viewId, viewLocation } from '../src/viewTracker'

function setup({
  addRumEvent,
  lifeCycle,
}: {
  addRumEvent?: () => any
  lifeCycle?: LifeCycle
} = {}) {
  spyOn(history, 'pushState').and.callFake((_: any, __: string, pathname: string) => {
    const url = new URL(pathname, 'http://localhost')
    fakeLocation.pathname = url.pathname
    fakeLocation.search = url.search
    fakeLocation.hash = url.hash
  })
  const fakeLocation: Partial<Location> = { pathname: '/foo' }
  trackView(fakeLocation as Location, lifeCycle || new LifeCycle(), addRumEvent || (() => undefined), () => undefined)
}

describe('rum track url change', () => {
  let initialView: string
  let initialLocation: Location

  beforeEach(() => {
    setup()
    initialView = viewId
    initialLocation = viewLocation
  })

  it('should update view id on path change', () => {
    history.pushState({}, '', '/bar')

    expect(viewId).not.toEqual(initialView)
    expect(viewLocation).not.toEqual(initialLocation)
  })

  it('should not update view id on search change', () => {
    history.pushState({}, '', '/foo?bar=qux')

    expect(viewId).toEqual(initialView)
    expect(viewLocation).toEqual(initialLocation)
  })

  it('should not update view id on hash change', () => {
    history.pushState({}, '', '/foo#bar')

    expect(viewId).toEqual(initialView)
    expect(viewLocation).toEqual(initialLocation)
  })
})

describe('rum track renew session', () => {
  it('should update page view id on renew session', () => {
    const lifeCycle = new LifeCycle()
    setup({
      lifeCycle,
    })
    const initialView = viewId
    lifeCycle.notify(LifeCycleEventType.renewSession)

    expect(viewId).not.toEqual(initialView)
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
  let addRumEvent: jasmine.Spy<InferableFunction>

  function getViewEvent(index: number) {
    return addRumEvent.calls.argsFor(index)[0] as RumViewEvent
  }

  function getEventCount() {
    return addRumEvent.calls.count()
  }

  beforeEach(() => {
    addRumEvent = jasmine.createSpy()
  })

  it('should track error count', () => {
    const lifeCycle = new LifeCycle()
    setup({ addRumEvent, lifeCycle })

    expect(getEventCount()).toEqual(1)
    expect(getViewEvent(0).view.measures.errorCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.error, {} as any)
    lifeCycle.notify(LifeCycleEventType.error, {} as any)
    history.pushState({}, '', '/bar')

    expect(getEventCount()).toEqual(3)
    expect(getViewEvent(1).view.measures.errorCount).toEqual(2)
    expect(getViewEvent(2).view.measures.errorCount).toEqual(0)
  })

  it('should track long task count', () => {
    const lifeCycle = new LifeCycle()
    setup({ addRumEvent, lifeCycle })

    expect(getEventCount()).toEqual(1)
    expect(getViewEvent(0).view.measures.longTaskCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.performance, FAKE_LONG_TASK as PerformanceLongTaskTiming)
    history.pushState({}, '', '/bar')

    expect(getEventCount()).toEqual(3)
    expect(getViewEvent(1).view.measures.longTaskCount).toEqual(1)
    expect(getViewEvent(2).view.measures.longTaskCount).toEqual(0)
  })

  it('should track user action count', () => {
    const lifeCycle = new LifeCycle()
    setup({ addRumEvent, lifeCycle })

    expect(getEventCount()).toEqual(1)
    expect(getViewEvent(0).view.measures.userActionCount).toEqual(0)

    lifeCycle.notify(LifeCycleEventType.userAction, FAKE_USER_ACTION as UserAction)
    history.pushState({}, '', '/bar')

    expect(getEventCount()).toEqual(3)
    expect(getViewEvent(1).view.measures.userActionCount).toEqual(1)
    expect(getViewEvent(2).view.measures.userActionCount).toEqual(0)
  })

  it('should track performance timings', () => {
    const lifeCycle = new LifeCycle()
    setup({ addRumEvent, lifeCycle })

    expect(getEventCount()).toEqual(1)
    expect(getViewEvent(0).view.measures).toEqual({
      errorCount: 0,
      longTaskCount: 0,
      userActionCount: 0,
    })

    lifeCycle.notify(LifeCycleEventType.performance, FAKE_PAINT_ENTRY as PerformancePaintTiming)
    lifeCycle.notify(LifeCycleEventType.performance, FAKE_NAVIGATION_ENTRY as PerformanceNavigationTiming)
    history.pushState({}, '', '/bar')

    expect(getEventCount()).toEqual(3)
    expect(getViewEvent(1).view.measures).toEqual({
      domComplete: 456e6,
      domContentLoaded: 345e6,
      domInteractive: 234e6,
      errorCount: 0,
      firstContentfulPaint: 123e6,
      loadEventEnd: 567e6,
      longTaskCount: 0,
      userActionCount: 0,
    })
    expect(getViewEvent(2).view.measures).toEqual({
      errorCount: 0,
      longTaskCount: 0,
      userActionCount: 0,
    })
  })
})
