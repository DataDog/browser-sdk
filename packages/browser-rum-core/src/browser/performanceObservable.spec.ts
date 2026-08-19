import type { Subscription } from '@datadog/browser-core'
import type { Duration } from '@datadog/js-core/time'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock } from '@datadog/browser-core/test'
import { createPerformanceEntry, mockPerformanceObserver } from '../../test'
import { RumPerformanceEntryType, createPerformanceObservable } from './performanceObservable'

describe('performanceObservable', () => {
  let performanceSubscription: Subscription | undefined
  const forbiddenUrl = 'https://forbidden.url/abce?ddsource=browser&dd-api-key=xxxx&dd-request-id=1234567890'
  const allowedUrl = 'https://allowed.url'
  let observableCallback: jasmine.Spy
  let clock: Clock

  beforeEach(() => {
    observableCallback = jasmine.createSpy()
    clock = mockClock()
  })

  afterEach(() => {
    performanceSubscription?.unsubscribe()
  })

  it('should notify performance resources', () => {
    const { notifyPerformanceEntries } = mockPerformanceObserver()
    const performanceResourceObservable = createPerformanceObservable({
      type: RumPerformanceEntryType.RESOURCE,
    })
    performanceSubscription = performanceResourceObservable.subscribe(observableCallback)

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { name: allowedUrl })])
    expect(observableCallback).toHaveBeenCalledWith([jasmine.objectContaining({ name: allowedUrl })])
  })

  it('should not notify performance resources with intake url', () => {
    const { notifyPerformanceEntries } = mockPerformanceObserver()
    const performanceResourceObservable = createPerformanceObservable({
      type: RumPerformanceEntryType.RESOURCE,
    })
    performanceSubscription = performanceResourceObservable.subscribe(observableCallback)

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { name: forbiddenUrl })])
    expect(observableCallback).not.toHaveBeenCalled()
  })

  it('should not notify performance resources with invalid duration', () => {
    const { notifyPerformanceEntries } = mockPerformanceObserver()
    const performanceResourceObservable = createPerformanceObservable({
      type: RumPerformanceEntryType.RESOURCE,
    })
    performanceSubscription = performanceResourceObservable.subscribe(observableCallback)

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { duration: -1 as Duration })])
    expect(observableCallback).not.toHaveBeenCalled()
  })

  it('should notify buffered performance resources asynchronously', () => {
    const { notifyPerformanceEntries } = mockPerformanceObserver()
    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE, { name: allowedUrl })])

    const performanceResourceObservable = createPerformanceObservable({
      type: RumPerformanceEntryType.RESOURCE,
      buffered: true,
    })
    performanceSubscription = performanceResourceObservable.subscribe(observableCallback)
    expect(observableCallback).not.toHaveBeenCalled()
    clock.tick(0)
    expect(observableCallback).toHaveBeenCalledWith([jasmine.objectContaining({ name: allowedUrl })])
  })

  it('should notify soft navigation entries', () => {
    const { notifyPerformanceEntries } = mockPerformanceObserver()
    const softNavigationObservable = createPerformanceObservable({
      type: RumPerformanceEntryType.SOFT_NAVIGATION,
    })
    performanceSubscription = softNavigationObservable.subscribe(observableCallback)

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION)])
    expect(observableCallback).toHaveBeenCalledWith([
      jasmine.objectContaining({ entryType: RumPerformanceEntryType.SOFT_NAVIGATION, interactionId: 42 }),
    ])
  })

  it('should notify interaction contentful paint entries', () => {
    const { notifyPerformanceEntries } = mockPerformanceObserver()
    const icpObservable = createPerformanceObservable({
      type: RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT,
    })
    performanceSubscription = icpObservable.subscribe(observableCallback)

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT)])
    expect(observableCallback).toHaveBeenCalledWith([
      jasmine.objectContaining({
        entryType: RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT,
        interactionId: 42,
        largestContentfulPaint: jasmine.objectContaining({ entryType: RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT }),
      }),
    ])
  })
})
