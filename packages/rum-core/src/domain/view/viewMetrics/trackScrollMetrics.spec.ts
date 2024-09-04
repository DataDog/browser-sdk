import type { RelativeTime, Subscription, TimeStamp } from '@datadog/browser-core'
import { DOM_EVENT, Observable, isIE } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { createNewEvent, mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import { mockRumConfiguration } from '../../../../test'
import type { ScrollMetrics, ScrollValues } from './trackScrollMetrics'
import { createScrollValuesObservable, trackScrollMetrics } from './trackScrollMetrics'

describe('createScrollValuesObserver', () => {
  const scrollObservable = createScrollValuesObservable(mockRumConfiguration(), 0)
  let subscription: Subscription

  const newScroll = () => {
    window.dispatchEvent(createNewEvent(DOM_EVENT.SCROLL))
  }

  const increaseHeight = () => {
    const node = document.createElement('div')
    node.style.height = '2000px'
    document.body.innerHTML = ''
    document.body.appendChild(node)
  }

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    registerCleanupTask(() => {
      subscription.unsubscribe()
      document.body.innerHTML = ''
    })
  })

  it('should produce a value when scrolling', () => {
    newScroll()
    subscription = scrollObservable.subscribe(({ scrollDepth }) => {
      expect(scrollDepth).toBeGreaterThan(0)
    })
  })

  it('should produce a value when the page is resized', () => {
    increaseHeight()
    subscription = scrollObservable.subscribe(({ scrollHeight }) => {
      expect(scrollHeight).toBeGreaterThan(600)
    })
  })
})

describe('trackScrollMetrics', () => {
  let clock: Clock
  let scrollMetricsCallback: jasmine.Spy<(metrics: ScrollMetrics) => void>

  const scrollObservable = new Observable<ScrollValues>()

  beforeEach(() => {
    scrollMetricsCallback = jasmine.createSpy()
    clock = mockClock()
    trackScrollMetrics(
      mockRumConfiguration(),
      { relative: 0 as RelativeTime, timeStamp: 0 as TimeStamp },
      scrollMetricsCallback,
      scrollObservable
    )
  })

  afterEach(() => {
    document.body.innerHTML = ''
    clock.cleanup()
  })

  const updateScrollValues = (scrollValues: ScrollValues) => {
    clock.tick(100)
    scrollObservable.notify(scrollValues)
  }

  it('should update scroll height and scroll depth', () => {
    updateScrollValues({ scrollDepth: 700, scrollHeight: 2000, scrollTop: 100 })
    expect(scrollMetricsCallback).toHaveBeenCalledOnceWith({
      maxDepth: 700,
      maxScrollHeight: 2000,
      maxScrollHeightTime: clock.relative(100),
      maxDepthScrollTop: 100,
    })
  })
  it('should update time and scroll height only if it has increased', () => {
    updateScrollValues({ scrollDepth: 700, scrollHeight: 2000, scrollTop: 100 })
    updateScrollValues({ scrollDepth: 700, scrollHeight: 1900, scrollTop: 100 })
    expect(scrollMetricsCallback).toHaveBeenCalledOnceWith({
      maxDepth: 700,
      maxScrollHeight: 2000,
      maxScrollHeightTime: clock.relative(100),
      maxDepthScrollTop: 100,
    })
  })

  it('should update max depth only if it has increased', () => {
    updateScrollValues({ scrollDepth: 700, scrollHeight: 2000, scrollTop: 100 })
    updateScrollValues({ scrollDepth: 600, scrollHeight: 2000, scrollTop: 0 })
    expect(scrollMetricsCallback).toHaveBeenCalledOnceWith({
      maxDepth: 700,
      maxScrollHeight: 2000,
      maxScrollHeightTime: clock.relative(100),
      maxDepthScrollTop: 100,
    })
  })
})
