import type { RelativeTime } from '@datadog/browser-core'
import { clocksOrigin, DOM_EVENT } from '@datadog/browser-core'
import {
  setPageVisibility,
  createNewEvent,
  restorePageVisibility,
  registerCleanupTask,
} from '@datadog/browser-core/test'
import type { RumPerformanceEntry } from '../../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import { appendElement, createPerformanceEntry, mockPerformanceObserver, mockRumConfiguration } from '../../../../test'
import type { LargestContentfulPaint } from './trackLargestContentfulPaint'
import { LCP_MAXIMUM_DELAY, trackLargestContentfulPaint } from './trackLargestContentfulPaint'
import { trackFirstHidden } from './trackFirstHidden'

describe('trackLargestContentfulPaint', () => {
  let lcpCallback: jasmine.Spy<(lcp: LargestContentfulPaint) => void>
  let eventTarget: Window
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void

  function startLCPTracking(activationStartImpl?: RelativeTime) {
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())

    const firstHidden = trackFirstHidden(mockRumConfiguration(), clocksOrigin())
    const largestContentfulPaint = trackLargestContentfulPaint(
      mockRumConfiguration(),
      firstHidden,
      eventTarget,
      lcpCallback,
      () => activationStartImpl as RelativeTime
    )

    registerCleanupTask(() => {
      firstHidden.stop()
      largestContentfulPaint.stop()
      restorePageVisibility()
    })
  }

  beforeEach(() => {
    lcpCallback = jasmine.createSpy()
    eventTarget = document.createElement('div') as unknown as Window
  })

  it('should provide the largest contentful paint timing', () => {
    startLCPTracking()
    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT)])

    expect(lcpCallback).toHaveBeenCalledOnceWith({
      value: 789 as RelativeTime,
      targetSelector: undefined,
      resourceUrl: undefined,
    })
  })

  it('should provide the largest contentful paint target selector', () => {
    startLCPTracking()
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
        element: appendElement('<button id="lcp-target-element"></button>'),
      }),
    ])

    expect(lcpCallback).toHaveBeenCalledOnceWith({
      value: 789 as RelativeTime,
      targetSelector: '#lcp-target-element',
      resourceUrl: undefined,
    })
  })

  it('should provide the largest contentful paint target url', () => {
    startLCPTracking()
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
        url: 'https://example.com/lcp-resource',
      }),
    ])

    expect(lcpCallback).toHaveBeenCalledOnceWith({
      value: 789 as RelativeTime,
      targetSelector: undefined,
      resourceUrl: 'https://example.com/lcp-resource',
    })
  })

  it('should be discarded if it is reported after a user interaction', () => {
    startLCPTracking()
    eventTarget.dispatchEvent(createNewEvent(DOM_EVENT.KEY_DOWN, { timeStamp: 1 }))

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT)])

    expect(lcpCallback).not.toHaveBeenCalled()
  })

  it('should be discarded if the page is hidden', () => {
    setPageVisibility('hidden')
    startLCPTracking()

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT)])

    expect(lcpCallback).not.toHaveBeenCalled()
  })

  it('should be discarded if it is reported after a long time', () => {
    startLCPTracking()
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
        startTime: LCP_MAXIMUM_DELAY as RelativeTime,
      }),
    ])

    expect(lcpCallback).not.toHaveBeenCalled()
  })

  it('should be discarded if it has a size inferior to the previous LCP entry', () => {
    startLCPTracking()
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
        startTime: 1 as RelativeTime,
        size: 10,
      }),
    ])

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
        startTime: 2 as RelativeTime,
        size: 5,
      }),
    ])

    expect(lcpCallback).toHaveBeenCalledOnceWith(jasmine.objectContaining({ value: 1 }))
  })

  it('should notify multiple times when the size is bigger than the previous entry', () => {
    startLCPTracking()
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
        startTime: 1 as RelativeTime,
        size: 5,
      }),
    ])

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
        startTime: 2 as RelativeTime,
        size: 10,
      }),
    ])
    expect(lcpCallback).toHaveBeenCalledTimes(2)
    expect(lcpCallback.calls.first().args[0]).toEqual(jasmine.objectContaining({ value: 1 }))
    expect(lcpCallback.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ value: 2 }))
  })

  it('should return undefined when LCP entry has an empty string as url', () => {
    startLCPTracking()
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
        url: '',
      }),
    ])

    expect(lcpCallback).toHaveBeenCalledOnceWith({
      value: 789 as RelativeTime,
      targetSelector: undefined,
      resourceUrl: undefined,
    })
  })

  it('should adjust LCP based on activationStart when prerendered', () => {
    startLCPTracking(100 as RelativeTime)

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
        startTime: 250 as RelativeTime,
        size: 100,
      }),
    ])

    expect(lcpCallback).toHaveBeenCalledOnceWith({
      value: 150 as RelativeTime,
      targetSelector: undefined,
      resourceUrl: undefined,
    })
  })
})
