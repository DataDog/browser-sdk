import { ErrorMessage } from '../../core/errorCollection'
import { Observable } from '../../core/observable'
import { Batch } from '../../core/transport'
import { pageViewId, trackPageView } from '../pageViewTracker'
import { PerformancePaintTiming, RumEvent, RumPageViewEvent } from '../rum'

function setup({
  addRumEvent,
  errorObservable,
  performanceObservable,
}: {
  addRumEvent?: () => any
  errorObservable?: Observable<ErrorMessage>
  performanceObservable?: Observable<PerformanceEntry>
} = {}) {
  spyOn(history, 'pushState').and.callFake((_: any, __: string, pathname: string) => {
    const url = new URL(pathname, 'http://localhost')
    fakeLocation.pathname = url.pathname
    fakeLocation.search = url.search
    fakeLocation.hash = url.hash
  })
  const fakeLocation: Partial<Location> = { pathname: '/foo' }
  const fakeBatch: Partial<Batch<RumEvent>> = { beforeFlushOnUnload: () => undefined }
  trackPageView(
    fakeBatch as Batch<RumEvent>,
    fakeLocation as Location,
    addRumEvent || (() => undefined),
    errorObservable || new Observable<ErrorMessage>(),
    performanceObservable || new Observable<PerformanceEntry>()
  )
}

describe('rum track url change', () => {
  let initialPageViewId: string

  beforeEach(() => {
    setup()
    initialPageViewId = pageViewId
  })

  it('should update page view id on path change', () => {
    history.pushState({}, '', '/bar')

    expect(pageViewId).not.toEqual(initialPageViewId)
  })

  it('should not update page view id on search change', () => {
    history.pushState({}, '', '/foo?bar=qux')

    expect(pageViewId).toEqual(initialPageViewId)
  })

  it('should not update page view id on hash change', () => {
    history.pushState({}, '', '/foo#bar')

    expect(pageViewId).toEqual(initialPageViewId)
  })
})

describe('rum page view summary', () => {
  let addRumEvent: jasmine.Spy<InferableFunction>

  function getPageViewEvent(index: number) {
    return addRumEvent.calls.argsFor(index)[0] as RumPageViewEvent
  }

  beforeEach(() => {
    addRumEvent = jasmine.createSpy()
  })

  it('should track error count', () => {
    const errorObservable = new Observable<ErrorMessage>()
    setup({ addRumEvent, errorObservable })

    expect(addRumEvent.calls.count()).toEqual(1)
    expect(getPageViewEvent(0).screen.summary.errorCount).toEqual(0)

    errorObservable.notify({} as any)
    errorObservable.notify({} as any)
    history.pushState({}, '', '/bar')

    expect(addRumEvent.calls.count()).toEqual(3)
    expect(getPageViewEvent(1).screen.summary.errorCount).toEqual(2)
    expect(getPageViewEvent(2).screen.summary.errorCount).toEqual(0)
  })
})

describe('rum page view performance', () => {
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

  function getPageViewEvent(index: number) {
    return addRumEvent.calls.argsFor(index)[0] as RumPageViewEvent
  }

  beforeEach(() => {
    addRumEvent = jasmine.createSpy()
  })

  it('should track performance', () => {
    const performanceObservable = new Observable<PerformanceEntry>()
    setup({ addRumEvent, performanceObservable })

    expect(addRumEvent.calls.count()).toEqual(1)
    expect(getPageViewEvent(0).screen.performance).toEqual({})

    performanceObservable.notify(FAKE_PAINT_ENTRY as PerformancePaintTiming)
    performanceObservable.notify(FAKE_NAVIGATION_ENTRY as PerformanceNavigationTiming)
    history.pushState({}, '', '/bar')

    expect(addRumEvent.calls.count()).toEqual(3)
    expect(getPageViewEvent(1).screen.performance).toEqual({
      domComplete: 456,
      domContentLoadedEventEnd: 345,
      domInteractive: 234,
      firstContentfulPaint: 123,
      loadEventEnd: 567,
    })
    expect(getPageViewEvent(2).screen.performance).toEqual({})
  })
})
