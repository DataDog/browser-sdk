import type { RelativeTime } from '@datadog/browser-core'
import { clocksOrigin, DOM_EVENT } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import {
  setPageVisibility,
  createNewEvent,
  restorePageVisibility,
  registerCleanupTask,
  mockClock,
} from '@datadog/browser-core/test'
import type { RumPerformanceEntry } from '../../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import { appendElement, createPerformanceEntry, mockPerformanceObserver, mockRumConfiguration } from '../../../../test'
import type { LargestContentfulPaint } from './trackLargestContentfulPaint'
import { LCP_MAXIMUM_DELAY, trackLargestContentfulPaint } from './trackLargestContentfulPaint'
import { trackFirstHidden } from './trackFirstHidden'

const mockPerformanceEntry = createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, {
  responseStart: 789 as RelativeTime,
})

const mockSubParts = {
  firstByte: 789 as RelativeTime,
  loadDelay: 0 as RelativeTime,
  loadTime: 0 as RelativeTime,
  renderDelay: 0 as RelativeTime,
}

describe('trackLargestContentfulPaint', () => {
  let lcpCallback: jasmine.Spy<(lcp: LargestContentfulPaint) => void>
  let eventTarget: Window
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void
  let clock: Clock

  function startLCPTracking() {
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())

    // This ensures getNavigationEntry() returns controlled values for subParts calculation.
    notifyPerformanceEntries([mockPerformanceEntry])

    const firstHidden = trackFirstHidden(mockRumConfiguration(), clocksOrigin())
    const largestContentfulPaint = trackLargestContentfulPaint(
      mockRumConfiguration(),
      firstHidden,
      eventTarget,
      lcpCallback
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
    // Mock clock and advance time so that responseStart: 789 passes the getSafeFirstByte check
    // which requires responseStart <= relativeNow()
    clock = mockClock()
    clock.tick(1000)
  })

  it('should provide the largest contentful paint timing', () => {
    startLCPTracking()
    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT)])

    expect(lcpCallback).toHaveBeenCalledOnceWith({
      value: 789 as RelativeTime,
      targetSelector: undefined,
      resourceUrl: undefined,
      subParts: mockSubParts,
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
      subParts: mockSubParts,
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
      subParts: mockSubParts,
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
      subParts: mockSubParts,
    })
  })

  it('should not provide subParts if the first byte is not available', () => {
    const { notifyPerformanceEntries: notifyEntries } = mockPerformanceObserver()

    // Notify navigation entry with negative responseStart, which makes getSafeFirstByte return undefined
    notifyEntries([
      createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, {
        responseStart: -1 as RelativeTime,
      }),
    ])

    const firstHidden = trackFirstHidden(mockRumConfiguration(), clocksOrigin())
    const largestContentfulPaint = trackLargestContentfulPaint(
      mockRumConfiguration(),
      firstHidden,
      eventTarget,
      lcpCallback
    )

    registerCleanupTask(() => {
      firstHidden.stop()
      largestContentfulPaint.stop()
    })

    notifyEntries([createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT)])

    expect(lcpCallback).toHaveBeenCalledOnceWith({
      value: 789 as RelativeTime,
      targetSelector: undefined,
      resourceUrl: undefined,
      subParts: undefined,
    })
  })

  describe('LCP subParts with activationStart (prerendering)', () => {
    it('should subtract activationStart from resource timings for prerendered pages', () => {
      const { notifyPerformanceEntries: notifyEntries } = mockPerformanceObserver()

      // Navigation with activationStart = 1000ms (prerendered page activated at 1000ms)
      // responseStart happened during prerender at 1100ms (relative to navigation start)
      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, {
          responseStart: 1100 as RelativeTime,
          activationStart: 1000 as RelativeTime,
        }),
      ])

      // Resource loaded during prerender
      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
          name: 'https://example.com/hero.jpg',
          startTime: 1200 as RelativeTime,
          requestStart: 1200 as RelativeTime,
          responseEnd: 1800 as RelativeTime,
        }),
      ])

      const firstHidden = trackFirstHidden(mockRumConfiguration(), clocksOrigin())
      const largestContentfulPaint = trackLargestContentfulPaint(
        mockRumConfiguration(),
        firstHidden,
        eventTarget,
        lcpCallback
      )

      registerCleanupTask(() => {
        firstHidden.stop()
        largestContentfulPaint.stop()
      })

      // LCP occurs at 2000ms (relative to navigation start)
      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 2000 as RelativeTime,
          url: 'https://example.com/hero.jpg',
        }),
      ])

      expect(lcpCallback).toHaveBeenCalledOnceWith({
        value: 2000 as RelativeTime,
        targetSelector: undefined,
        resourceUrl: 'https://example.com/hero.jpg',
        subParts: {
          // adjustedFirstByte = max(0, responseStart - activationStart) = max(0, 1100 - 1000) = 100
          firstByte: 100 as RelativeTime,
          // lcpRequestStart = max(adjustedFirstByte, requestStart - activationStart)
          //                 = max(100, 1200 - 1000) = max(100, 200) = 200
          // loadDelay = lcpRequestStart - adjustedFirstByte = 200 - 100 = 100
          loadDelay: 100 as RelativeTime,
          // lcpResponseEnd = min(lcpTime, max(lcpRequestStart, responseEnd - activationStart))
          //                = min(2000, max(200, 1800 - 1000))
          //                = min(2000, max(200, 800)) = min(2000, 800) = 800
          // loadTime = lcpResponseEnd - lcpRequestStart = 800 - 200 = 600
          loadTime: 600 as RelativeTime,
          // renderDelay = lcpTime - lcpResponseEnd = 2000 - 800 = 1200
          renderDelay: 1200 as RelativeTime,
        },
      })
    })

    it('should handle activationStart = 0 for non-prerendered pages', () => {
      const { notifyPerformanceEntries: notifyEntries } = mockPerformanceObserver()

      // Navigation without activationStart (or activationStart = 0)
      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, {
          responseStart: 500 as RelativeTime,
          activationStart: 0 as RelativeTime,
        }),
      ])

      // Resource: starts at 600ms, ends at 800ms
      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
          name: 'https://example.com/image.jpg',
          startTime: 600 as RelativeTime,
          requestStart: 600 as RelativeTime,
          responseEnd: 800 as RelativeTime,
        }),
      ])

      const firstHidden = trackFirstHidden(mockRumConfiguration(), clocksOrigin())
      const largestContentfulPaint = trackLargestContentfulPaint(
        mockRumConfiguration(),
        firstHidden,
        eventTarget,
        lcpCallback
      )

      registerCleanupTask(() => {
        firstHidden.stop()
        largestContentfulPaint.stop()
      })

      // LCP at 900ms
      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 900 as RelativeTime,
          url: 'https://example.com/image.jpg',
        }),
      ])

      expect(lcpCallback).toHaveBeenCalledOnceWith({
        value: 900 as RelativeTime,
        targetSelector: undefined,
        resourceUrl: 'https://example.com/image.jpg',
        subParts: {
          firstByte: 500 as RelativeTime,
          loadDelay: 100 as RelativeTime, // 600 - 500
          loadTime: 200 as RelativeTime, // 800 - 600
          renderDelay: 100 as RelativeTime, // 900 - 800
        },
      })
    })
  })

  describe('LCP subParts capping at LCP time', () => {
    it('should cap lcpResponseEnd at LCP time for resources that complete after LCP', () => {
      const { notifyPerformanceEntries: notifyEntries } = mockPerformanceObserver()

      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, {
          responseStart: 200 as RelativeTime,
        }),
      ])

      // Video resource that continues downloading after LCP occurs
      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
          name: 'https://example.com/video.mp4',
          startTime: 500 as RelativeTime,
          requestStart: 500 as RelativeTime,
          responseEnd: 5000 as RelativeTime, // Continues downloading long after LCP
        }),
      ])

      const firstHidden = trackFirstHidden(mockRumConfiguration(), clocksOrigin())
      const largestContentfulPaint = trackLargestContentfulPaint(
        mockRumConfiguration(),
        firstHidden,
        eventTarget,
        lcpCallback
      )

      registerCleanupTask(() => {
        firstHidden.stop()
        largestContentfulPaint.stop()
      })

      // LCP occurs at 1200ms (first frame painted)
      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1200 as RelativeTime,
          url: 'https://example.com/video.mp4',
        }),
      ])

      const result = lcpCallback.calls.mostRecent().args[0]

      // lcpResponseEnd should be capped at 1200ms, not 5000ms
      expect(result.subParts).toEqual({
        firstByte: 200 as RelativeTime,
        loadDelay: 300 as RelativeTime, // 500 - 200
        loadTime: 700 as RelativeTime, // 1200 (capped) - 500
        renderDelay: 0 as RelativeTime, // 1200 - 1200 (capped) = 0
      })
    })

    it('should not cap lcpResponseEnd when resource completes before LCP', () => {
      const { notifyPerformanceEntries: notifyEntries } = mockPerformanceObserver()

      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, {
          responseStart: 200 as RelativeTime,
        }),
      ])

      // Normal resource that completes before LCP
      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
          name: 'https://example.com/image.jpg',
          startTime: 500 as RelativeTime,
          requestStart: 500 as RelativeTime,
          responseEnd: 1000 as RelativeTime,
        }),
      ])

      const firstHidden = trackFirstHidden(mockRumConfiguration(), clocksOrigin())
      const largestContentfulPaint = trackLargestContentfulPaint(
        mockRumConfiguration(),
        firstHidden,
        eventTarget,
        lcpCallback
      )

      registerCleanupTask(() => {
        firstHidden.stop()
        largestContentfulPaint.stop()
      })

      // LCP at 1200ms (after resource completes)
      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1200 as RelativeTime,
          url: 'https://example.com/image.jpg',
        }),
      ])

      expect(lcpCallback).toHaveBeenCalledOnceWith({
        value: 1200 as RelativeTime,
        targetSelector: undefined,
        resourceUrl: 'https://example.com/image.jpg',
        subParts: {
          firstByte: 200 as RelativeTime,
          loadDelay: 300 as RelativeTime, // 500 - 200
          loadTime: 500 as RelativeTime, // 1000 - 500 (not capped)
          renderDelay: 200 as RelativeTime, // 1200 - 1000
        },
      })
    })

    it('should ensure sum of subParts equals LCP value', () => {
      const { notifyPerformanceEntries: notifyEntries } = mockPerformanceObserver()

      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, {
          responseStart: 100 as RelativeTime,
        }),
      ])

      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
          name: 'https://example.com/resource.jpg',
          startTime: 300 as RelativeTime,
          requestStart: 300 as RelativeTime,
          responseEnd: 800 as RelativeTime,
        }),
      ])

      const firstHidden = trackFirstHidden(mockRumConfiguration(), clocksOrigin())
      const largestContentfulPaint = trackLargestContentfulPaint(
        mockRumConfiguration(),
        firstHidden,
        eventTarget,
        lcpCallback
      )

      registerCleanupTask(() => {
        firstHidden.stop()
        largestContentfulPaint.stop()
      })

      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1000 as RelativeTime,
          url: 'https://example.com/resource.jpg',
        }),
      ])

      const result = lcpCallback.calls.mostRecent().args[0]
      const subParts = result.subParts!

      // Validate: firstByte + loadDelay + loadTime + renderDelay = LCP value
      const sum = subParts.firstByte + subParts.loadDelay + subParts.loadTime + subParts.renderDelay
      expect(sum).toBe(result.value)
    })
  })

  describe('LCP subParts requestStart preference', () => {
    it('should prefer requestStart over startTime when available', () => {
      const { notifyPerformanceEntries: notifyEntries } = mockPerformanceObserver()

      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, {
          responseStart: 200 as RelativeTime,
        }),
      ])

      // Resource with both requestStart and startTime (TAO enabled)
      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
          name: 'https://example.com/image.jpg',
          startTime: 500 as RelativeTime, // Resource discovered at 500ms
          requestStart: 700 as RelativeTime, // HTTP request started at 700ms (delayed)
          responseEnd: 1000 as RelativeTime,
        }),
      ])

      const firstHidden = trackFirstHidden(mockRumConfiguration(), clocksOrigin())
      const largestContentfulPaint = trackLargestContentfulPaint(
        mockRumConfiguration(),
        firstHidden,
        eventTarget,
        lcpCallback
      )

      registerCleanupTask(() => {
        firstHidden.stop()
        largestContentfulPaint.stop()
      })

      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1200 as RelativeTime,
          url: 'https://example.com/image.jpg',
        }),
      ])

      expect(lcpCallback).toHaveBeenCalledOnceWith({
        value: 1200 as RelativeTime,
        targetSelector: undefined,
        resourceUrl: 'https://example.com/image.jpg',
        subParts: {
          firstByte: 200 as RelativeTime,
          loadDelay: 500 as RelativeTime, // 700 (requestStart) - 200, not 300 (startTime - 200)
          loadTime: 300 as RelativeTime, // 1000 - 700 (requestStart)
          renderDelay: 200 as RelativeTime, // 1200 - 1000
        },
      })
    })

    it('should fallback to startTime when requestStart is 0', () => {
      const { notifyPerformanceEntries: notifyEntries } = mockPerformanceObserver()

      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, {
          responseStart: 200 as RelativeTime,
        }),
      ])

      // Cross-origin resource without TAO: requestStart = 0
      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
          name: 'https://cdn.example.com/image.jpg',
          startTime: 500 as RelativeTime,
          requestStart: 0 as RelativeTime, // Not available (cross-origin without TAO)
          responseEnd: 1000 as RelativeTime,
        }),
      ])

      const firstHidden = trackFirstHidden(mockRumConfiguration(), clocksOrigin())
      const largestContentfulPaint = trackLargestContentfulPaint(
        mockRumConfiguration(),
        firstHidden,
        eventTarget,
        lcpCallback
      )

      registerCleanupTask(() => {
        firstHidden.stop()
        largestContentfulPaint.stop()
      })

      notifyEntries([
        createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1200 as RelativeTime,
          url: 'https://cdn.example.com/image.jpg',
        }),
      ])

      expect(lcpCallback).toHaveBeenCalledOnceWith({
        value: 1200 as RelativeTime,
        targetSelector: undefined,
        resourceUrl: 'https://cdn.example.com/image.jpg',
        subParts: {
          firstByte: 200 as RelativeTime,
          loadDelay: 300 as RelativeTime, // Falls back to: 500 (startTime) - 200
          loadTime: 500 as RelativeTime, // 1000 - 500 (startTime)
          renderDelay: 200 as RelativeTime, // 1200 - 1000
        },
      })
    })
  })
})
