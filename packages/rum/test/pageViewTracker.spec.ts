import { Batch, Message, MessageType, Observable } from '@browser-agent/core'

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
  messageObservable,
  customEventObservable,
}: {
  addRumEvent?: () => any
  messageObservable?: Observable<Message>
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
    messageObservable || new Observable<Message>(),
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
  const FAKE_LONG_TASK_MESSAGE = {
    // tslint:disable-next-line: no-object-literal-type-assertion
    entry: {
      entryType: 'longtask',
      startTime: 456,
    } as PerformanceLongTaskTiming,
    type: MessageType.performance as MessageType.performance,
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
    const messageObservable = new Observable<Message>()
    setup({ addRumEvent, messageObservable })

    expect(addRumEvent.calls.count()).toEqual(1)
    expect(getPageViewEvent(0).screen.summary.errorCount).toEqual(0)

    messageObservable.notify({ type: MessageType.error } as any)
    messageObservable.notify({ type: MessageType.error } as any)
    history.pushState({}, '', '/bar')

    expect(addRumEvent.calls.count()).toEqual(3)
    expect(getPageViewEvent(1).screen.summary.errorCount).toEqual(2)
    expect(getPageViewEvent(2).screen.summary.errorCount).toEqual(0)
  })

  it('should track long task count', () => {
    const messageObservable = new Observable<Message>()
    setup({ addRumEvent, messageObservable })

    expect(addRumEvent.calls.count()).toEqual(1)
    expect(getPageViewEvent(0).screen.summary.longTaskCount).toEqual(0)

    messageObservable.notify(FAKE_LONG_TASK_MESSAGE)
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
  const FAKE_PAINT_MESSAGE = {
    // tslint:disable-next-line: no-object-literal-type-assertion
    entry: {
      entryType: 'paint',
      name: 'first-contentful-paint',
      startTime: 123,
    } as PerformancePaintTiming,
    type: MessageType.performance as MessageType.performance,
  }
  const FAKE_NAVIGATION_MESSAGE = {
    // tslint:disable-next-line: no-object-literal-type-assertion
    entry: {
      domComplete: 456,
      domContentLoadedEventEnd: 345,
      domInteractive: 234,
      entryType: 'navigation',
      loadEventEnd: 567,
    } as PerformanceNavigationTiming,
    type: MessageType.performance as MessageType.performance,
  }
  let addRumEvent: jasmine.Spy<InferableFunction>

  function getPageViewEvent(index: number) {
    return addRumEvent.calls.argsFor(index)[0] as RumPageViewEvent
  }

  beforeEach(() => {
    addRumEvent = jasmine.createSpy()
  })

  it('should track performance', () => {
    const messageObservable = new Observable<Message>()
    setup({ addRumEvent, messageObservable })

    expect(addRumEvent.calls.count()).toEqual(1)
    expect(getPageViewEvent(0).screen.performance).toEqual({})

    messageObservable.notify(FAKE_PAINT_MESSAGE)
    messageObservable.notify(FAKE_NAVIGATION_MESSAGE)
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
