import type { RelativeTime } from '@datadog/js-core/time'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { appendElement, createPerformanceEntry, mockPerformanceObserver, mockRumConfiguration } from '../../../../test'
import type { RumPerformanceEntry } from '../../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../../browser/performanceObservable'
import { trackRouteChangeViewMetrics } from './trackRouteChangeViewMetrics'

describe('trackRouteChangeViewMetrics', () => {
  let scheduleViewUpdate: jasmine.Spy<() => void>
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void
  let activeObserverCount: (entryType: RumPerformanceEntryType) => number

  function startTracking() {
    ;({ notifyPerformanceEntries, activeObserverCount } = mockPerformanceObserver())
    const tracker = trackRouteChangeViewMetrics(mockRumConfiguration(), scheduleViewUpdate)
    registerCleanupTask(() => tracker.stop())
    return tracker
  }

  beforeEach(() => {
    scheduleViewUpdate = jasmine.createSpy()
  })

  it('should report LCP from the soft-navigation entry seeded ICP', () => {
    const { initialViewMetrics } = startTracking()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        interactionId: 7,
        getLargestInteractionContentfulPaint: () =>
          createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
            interactionId: 7,
            largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
              startTime: 1250 as RelativeTime,
              size: 100,
            }),
          }),
      }),
    ])

    expect(initialViewMetrics.largestContentfulPaint).toEqual({
      value: 250 as RelativeTime,
      targetSelector: undefined,
      resourceUrl: undefined,
      subParts: {
        loadDelay: 0 as RelativeTime,
        loadTime: 0 as RelativeTime,
        renderDelay: 250 as RelativeTime,
      },
    })
    expect(scheduleViewUpdate).toHaveBeenCalledTimes(1)
  })

  it('should pick up an ICP entry that arrived before the soft-navigation entry', () => {
    const { initialViewMetrics } = startTracking()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
        interactionId: 7,
        largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1250 as RelativeTime,
          size: 100,
        }),
      }),
    ])
    expect(scheduleViewUpdate).not.toHaveBeenCalled()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        interactionId: 7,
        getLargestInteractionContentfulPaint: () => null,
      }),
    ])

    expect(initialViewMetrics.largestContentfulPaint?.value).toBe(250 as RelativeTime)
    expect(scheduleViewUpdate).toHaveBeenCalledTimes(1)
  })

  it('should update LCP when a bigger ICP entry arrives for the same interaction', () => {
    const { initialViewMetrics } = startTracking()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        interactionId: 7,
        getLargestInteractionContentfulPaint: () => null,
      }),
    ])

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
        interactionId: 7,
        largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1200 as RelativeTime,
          size: 50,
        }),
      }),
    ])
    expect(initialViewMetrics.largestContentfulPaint?.value).toBe(200 as RelativeTime)

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
        interactionId: 7,
        largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1400 as RelativeTime,
          size: 100,
        }),
      }),
    ])
    expect(initialViewMetrics.largestContentfulPaint?.value).toBe(400 as RelativeTime)
    expect(scheduleViewUpdate).toHaveBeenCalledTimes(2)
  })

  it('should ignore ICP entries with a size not bigger than the current LCP', () => {
    const { initialViewMetrics } = startTracking()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        interactionId: 7,
        getLargestInteractionContentfulPaint: () => null,
      }),
    ])
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
        interactionId: 7,
        largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1400 as RelativeTime,
          size: 100,
        }),
      }),
    ])
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
        interactionId: 7,
        largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1200 as RelativeTime,
          size: 50,
        }),
      }),
    ])

    expect(initialViewMetrics.largestContentfulPaint?.value).toBe(400 as RelativeTime)
    expect(scheduleViewUpdate).toHaveBeenCalledTimes(1)
  })

  it('should ignore ICP entries for a different interaction', () => {
    const { initialViewMetrics } = startTracking()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        interactionId: 7,
        getLargestInteractionContentfulPaint: () => null,
      }),
    ])
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
        interactionId: 99,
        largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1400 as RelativeTime,
          size: 100,
        }),
      }),
    ])

    expect(initialViewMetrics.largestContentfulPaint).toBeUndefined()
    expect(scheduleViewUpdate).not.toHaveBeenCalled()
  })

  it('should compute the target selector and resource url from the LCP element', () => {
    const { initialViewMetrics } = startTracking()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        interactionId: 7,
        getLargestInteractionContentfulPaint: () =>
          createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
            interactionId: 7,
            largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
              startTime: 1250 as RelativeTime,
              size: 100,
              element: appendElement('<div id="soft-nav-lcp"></div>'),
              url: 'https://example.com/soft-nav-image.png',
            }),
          }),
      }),
    ])

    expect(initialViewMetrics.largestContentfulPaint).toEqual({
      value: 250 as RelativeTime,
      targetSelector: '#soft-nav-lcp',
      resourceUrl: 'https://example.com/soft-nav-image.png',
      subParts: {
        loadDelay: 0 as RelativeTime,
        loadTime: 0 as RelativeTime,
        renderDelay: 250 as RelativeTime,
      },
    })
  })

  it('should not let a later soft-navigation entry be claimed after setViewEnd', () => {
    const { initialViewMetrics, setViewEnd } = startTracking()

    // This view's own interaction never produces a soft-navigation entry (e.g. a programmatic
    // route change). The view ends when the next route change starts.
    setViewEnd()

    // A soft-navigation entry belonging to the *next* view must not be claimed by this
    // already-ended tracker.
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 5000 as RelativeTime,
        interactionId: 42,
        getLargestInteractionContentfulPaint: () =>
          createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
            interactionId: 42,
            largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
              startTime: 5200 as RelativeTime,
              size: 999,
            }),
          }),
      }),
    ])

    expect(initialViewMetrics.largestContentfulPaint).toBeUndefined()
    expect(scheduleViewUpdate).not.toHaveBeenCalled()
  })

  it('should keep applying ICP updates for its own interaction after setViewEnd', () => {
    const { initialViewMetrics, setViewEnd } = startTracking()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        interactionId: 7,
        getLargestInteractionContentfulPaint: () => null,
      }),
    ])

    setViewEnd()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
        interactionId: 7,
        largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1300 as RelativeTime,
          size: 10,
        }),
      }),
    ])

    expect(initialViewMetrics.largestContentfulPaint?.value).toBe(300 as RelativeTime)
  })

  it('should stop observing ICP entries on setViewEnd when the view never got a soft-navigation entry', () => {
    const { setViewEnd } = startTracking()

    expect(activeObserverCount(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT)).toBe(1)

    // This view's own interaction never produces a soft-navigation entry (e.g. a programmatic
    // route change). Nothing will ever correlate against it, so the ICP observer -- and its
    // buffer -- shouldn't be kept alive for the remaining 5 minutes until stop().
    setViewEnd()

    expect(activeObserverCount(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT)).toBe(0)
  })

  it('should stop applying ICP updates after stop()', () => {
    const { initialViewMetrics, stop } = startTracking()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
        startTime: 1000 as RelativeTime,
        interactionId: 7,
        getLargestInteractionContentfulPaint: () =>
          createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
            interactionId: 7,
            largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
              startTime: 1200 as RelativeTime,
              size: 50,
            }),
          }),
      }),
    ])
    expect(initialViewMetrics.largestContentfulPaint?.value).toBe(200 as RelativeTime)

    stop()

    // A bigger ICP entry for the same interaction arrives after stop(): must be ignored.
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
        interactionId: 7,
        largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
          startTime: 1900 as RelativeTime,
          size: 999,
        }),
      }),
    ])

    expect(initialViewMetrics.largestContentfulPaint?.value).toBe(200 as RelativeTime)
  })

  describe('LCP subParts', () => {
    it('should compute subParts using the soft-navigation start as the TTFB baseline', () => {
      const { initialViewMetrics } = startTracking()
      const resourceUrl = 'https://example.com/soft-nav-image.png'

      notifyPerformanceEntries([
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
          name: resourceUrl,
          startTime: 1200 as RelativeTime,
          requestStart: 1200 as RelativeTime,
          responseEnd: 1400 as RelativeTime,
        }),
      ])

      notifyPerformanceEntries([
        createPerformanceEntry(RumPerformanceEntryType.SOFT_NAVIGATION, {
          startTime: 1000 as RelativeTime,
          interactionId: 7,
          getLargestInteractionContentfulPaint: () =>
            createPerformanceEntry(RumPerformanceEntryType.INTERACTION_CONTENTFUL_PAINT, {
              interactionId: 7,
              largestContentfulPaint: createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
                startTime: 1500 as RelativeTime,
                size: 100,
                url: resourceUrl,
              }),
            }),
        }),
      ])

      expect(initialViewMetrics.largestContentfulPaint?.value).toBe(500 as RelativeTime)
      expect(initialViewMetrics.largestContentfulPaint?.subParts).toEqual({
        loadDelay: 200 as RelativeTime, // 1200 (resource requestStart) - 1000 (soft nav start)
        loadTime: 200 as RelativeTime, // 1400 (responseEnd) - 1200 (requestStart)
        renderDelay: 100 as RelativeTime, // 1500 (LCP time) - 1400 (responseEnd)
      })
    })
  })
})
