import { Batch, ErrorMessage, Observable } from '@browser-agent/core'

import { pageViewId, trackPageView } from '../src/pageViewTracker'
import {
  PerformanceLongTaskTiming,
  PerformancePaintTiming,
  RawCustomEvent,
  RumEvent,
  RumPageViewEvent,
} from '../src/rum'

function setup({
  addRumEvent,
  errorObservable,
  performanceObservable,
  customEventObservable,
}: {
  addRumEvent?: () => any
  errorObservable?: Observable<ErrorMessage>
  performanceObservable?: Observable<PerformanceEntry>
  customEventObservable?: Observable<RawCustomEvent>
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
    performanceObservable || new Observable<PerformanceEntry>(),
    customEventObservable || new Observable<RawCustomEvent>()
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
  const FAKE_LONG_TASK = {
    entryType: 'longtask',
    startTime: 456,
  }
  const FAKE_CUSTOM_EVENT = {
    context: {
      bar: 123,
    },
    name: 'foo',
  }
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

  it('should track long task count', () => {
    const performanceObservable = new Observable<PerformanceEntry>()
    setup({ addRumEvent, performanceObservable })

    expect(addRumEvent.calls.count()).toEqual(1)
    expect(getPageViewEvent(0).screen.summary.longTaskCount).toEqual(0)

    performanceObservable.notify(FAKE_LONG_TASK as PerformanceLongTaskTiming)
    history.pushState({}, '', '/bar')

    expect(addRumEvent.calls.count()).toEqual(3)
    expect(getPageViewEvent(1).screen.summary.longTaskCount).toEqual(1)
    expect(getPageViewEvent(2).screen.summary.longTaskCount).toEqual(0)
  })

  it('should track custom event count', () => {
    const customEventObservable = new Observable<RawCustomEvent>()
    setup({ addRumEvent, customEventObservable })

    expect(addRumEvent.calls.count()).toEqual(1)
    expect(getPageViewEvent(0).screen.summary.customEventCount).toEqual(0)

    customEventObservable.notify(FAKE_CUSTOM_EVENT as RawCustomEvent)
    history.pushState({}, '', '/bar')

    expect(addRumEvent.calls.count()).toEqual(3)
    expect(getPageViewEvent(1).screen.summary.customEventCount).toEqual(1)
    expect(getPageViewEvent(2).screen.summary.customEventCount).toEqual(0)
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
      domComplete: 456e6,
      domContentLoaded: 345e6,
      domInteractive: 234e6,
      firstContentfulPaint: 123e6,
      loadEventEnd: 567e6,
    })
    expect(getPageViewEvent(2).screen.performance).toEqual({})
  })
})
