import type { RelativeTime } from '@datadog/browser-core'
import {
  clocksOrigin,
  DOM_EVENT,
  ExperimentalFeature,
  addExperimentalFeatures,
  resetExperimentalFeatures,
} from '@datadog/browser-core'
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

interface ResourceEntryOptions {
  name: string
  startTime: RelativeTime
  requestStart: RelativeTime
  responseEnd: RelativeTime
}

interface StartLCPTrackingOptions {
  responseStart?: RelativeTime
  resources?: ResourceEntryOptions[]
}

interface SubPartsTestCase {
  description: string
  responseStart: RelativeTime
  resource: ResourceEntryOptions
  lcpTime: RelativeTime
  expectedSubParts: {
    loadDelay: RelativeTime
    loadTime: RelativeTime
    renderDelay: RelativeTime
  }
}

const subPartsTestCases: SubPartsTestCase[] = [
  {
    description: 'should cap lcpResponseEnd at LCP time for resources that complete after LCP',
    responseStart: 200 as RelativeTime,
    resource: {
      name: 'https://example.com/video.mp4',
      startTime: 500 as RelativeTime,
      requestStart: 500 as RelativeTime,
      responseEnd: 5000 as RelativeTime, // Continues downloading long after LCP
    },
    lcpTime: 1200 as RelativeTime,
    expectedSubParts: {
      loadDelay: 300 as RelativeTime, // 500 - 200
      loadTime: 700 as RelativeTime, // 1200 (capped) - 500
      renderDelay: 0 as RelativeTime, // 1200 - 1200 (capped) = 0
    },
  },
  {
    description: 'should not cap lcpResponseEnd when resource completes before LCP',
    responseStart: 200 as RelativeTime,
    resource: {
      name: 'https://example.com/image.jpg',
      startTime: 500 as RelativeTime,
      requestStart: 500 as RelativeTime,
      responseEnd: 1000 as RelativeTime,
    },
    lcpTime: 1200 as RelativeTime,
    expectedSubParts: {
      loadDelay: 300 as RelativeTime, // 500 - 200
      loadTime: 500 as RelativeTime, // 1000 - 500 (not capped)
      renderDelay: 200 as RelativeTime, // 1200 - 1000
    },
  },
  {
    description: 'should prefer requestStart over startTime when available (TAO enabled)',
    responseStart: 200 as RelativeTime,
    resource: {
      name: 'https://example.com/image.jpg',
      startTime: 500 as RelativeTime, // Resource discovered at 500ms
      requestStart: 700 as RelativeTime, // HTTP request started at 700ms (delayed)
      responseEnd: 1000 as RelativeTime,
    },
    lcpTime: 1200 as RelativeTime,
    expectedSubParts: {
      loadDelay: 500 as RelativeTime, // 700 (requestStart) - 200, not 300 (startTime - 200)
      loadTime: 300 as RelativeTime, // 1000 - 700 (requestStart)
      renderDelay: 200 as RelativeTime, // 1200 - 1000
    },
  },
  {
    description: 'should fallback to startTime when requestStart is 0 (cross-origin without TAO)',
    responseStart: 200 as RelativeTime,
    resource: {
      name: 'https://cdn.example.com/image.jpg',
      startTime: 500 as RelativeTime,
      requestStart: 0 as RelativeTime, // Not available (cross-origin without TAO)
      responseEnd: 1000 as RelativeTime,
    },
    lcpTime: 1200 as RelativeTime,
    expectedSubParts: {
      loadDelay: 300 as RelativeTime, // Falls back to: 500 (startTime) - 200
      loadTime: 500 as RelativeTime, // 1000 - 500 (startTime)
      renderDelay: 200 as RelativeTime, // 1200 - 1000
    },
  },
  {
    description: 'should handle TAO resource with normal completion',
    responseStart: 100 as RelativeTime,
    resource: {
      name: 'https://example.com/product-image.jpg',
      startTime: 200 as RelativeTime, // Resource discovered
      requestStart: 300 as RelativeTime, // HTTP request started (prefer this)
      responseEnd: 700 as RelativeTime, // Download completed
    },
    lcpTime: 900 as RelativeTime,
    expectedSubParts: {
      loadDelay: 200 as RelativeTime, // 300 - 100
      loadTime: 400 as RelativeTime, // 700 - 300
      renderDelay: 200 as RelativeTime, // 900 - 700
    },
  },
  {
    description: 'should handle resource that completes exactly at LCP time',
    responseStart: 100 as RelativeTime,
    resource: {
      name: 'https://example.com/sync-image.jpg',
      startTime: 500 as RelativeTime,
      requestStart: 500 as RelativeTime,
      responseEnd: 1200 as RelativeTime, // Completes exactly at LCP time
    },
    lcpTime: 1200 as RelativeTime,
    expectedSubParts: {
      loadDelay: 400 as RelativeTime, // 500 - 100
      loadTime: 700 as RelativeTime, // 1200 - 500
      renderDelay: 0 as RelativeTime, // 1200 - 1200 = 0 (no render delay)
    },
  },
]

describe('trackLargestContentfulPaint', () => {
  let lcpCallback: jasmine.Spy<(lcp: LargestContentfulPaint) => void>
  let eventTarget: Window
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void
  let clock: Clock
  let mockSubParts: LargestContentfulPaint['subParts']

  function startLCPTracking(options: StartLCPTrackingOptions = {}) {
    const { responseStart = 789 as RelativeTime, resources = [] } = options

    ;({ notifyPerformanceEntries } = mockPerformanceObserver())

    // This ensures getNavigationEntry() returns controlled values for subParts calculation.
    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, { responseStart })])

    // Notify any resource entries before starting LCP tracking
    for (const resource of resources) {
      notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.RESOURCE, resource)])
    }

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

    mockSubParts = {
      loadDelay: 0 as RelativeTime,
      loadTime: 0 as RelativeTime,
      renderDelay: 0 as RelativeTime,
    }
  }

  beforeEach(() => {
    addExperimentalFeatures([ExperimentalFeature.COLLECT_LCP_SUBPARTS])
    registerCleanupTask(resetExperimentalFeatures)

    lcpCallback = jasmine.createSpy()
    eventTarget = document.createElement('div') as unknown as Window
    // Mock clock and advance time so that responseStart: 789 passes the sanitizeFirstByte check
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

    // Notify navigation entry with negative responseStart, which makes sanitizeFirstByte return undefined
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

  describe('LCP subParts', () => {
    subPartsTestCases.forEach(({ description, responseStart, resource, lcpTime, expectedSubParts }) => {
      it(description, () => {
        startLCPTracking({
          responseStart,
          resources: [resource],
        })

        notifyPerformanceEntries([
          createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
            startTime: lcpTime,
            url: resource.name,
          }),
        ])

        const result = lcpCallback.calls.mostRecent().args[0]

        expect(result.subParts).toEqual(expectedSubParts)

        // Validate: firstByte + loadDelay + loadTime + renderDelay = LCP value
        const sum = Object.values(result.subParts!).reduce((acc, curr) => acc + curr, 0)
        expect(sum + responseStart).toBe(result.value)
      })
    })

    describe('edge cases', () => {
      it('should handle LCP with no associated resource entry', () => {
        startLCPTracking({
          responseStart: 200 as RelativeTime,
        })

        // LCP with no resource URL (e.g., text, data URL, inline image)
        notifyPerformanceEntries([
          createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
            startTime: 1000 as RelativeTime,
            url: '', // Empty URL = no resource
          }),
        ])

        expect(lcpCallback).toHaveBeenCalledOnceWith({
          value: 1000 as RelativeTime,
          targetSelector: undefined,
          resourceUrl: undefined,
          subParts: {
            loadDelay: 0 as RelativeTime, // No resource, so max(firstByte, 0) - firstByte = 0
            loadTime: 0 as RelativeTime, // No resource, so max(firstByte, 0) - firstByte = 0
            renderDelay: 800 as RelativeTime, // 1000 - 200 (firstByte is used as lcpResponseEnd when no resource)
          },
        })
      })

      it('should handle cached resource with incomplete timing data', () => {
        const mockFirstByteValue = 150 as RelativeTime

        // Cross-origin resource without TAO: limited timing info
        startLCPTracking({
          responseStart: 150 as RelativeTime,
          resources: [
            {
              name: 'https://cdn.external.com/cached-image.jpg',
              startTime: 400 as RelativeTime,
              requestStart: 0 as RelativeTime, // Not available (cross-origin)
              responseEnd: 0 as RelativeTime, // Not available (cached)
            },
          ],
        })

        notifyPerformanceEntries([
          createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
            startTime: 800 as RelativeTime,
            url: 'https://cdn.external.com/cached-image.jpg',
          }),
        ])

        const result = lcpCallback.calls.mostRecent().args[0]

        expect(result.subParts).toEqual({
          // lcpRequestStart = max(150, 400 - 0) = 400 (falls back to startTime)
          loadDelay: 250 as RelativeTime, // 400 - 150
          // lcpResponseEnd = min(800, max(400, 0 - 0)) = min(800, 400) = 400
          loadTime: 0 as RelativeTime, // 400 - 400
          renderDelay: 400 as RelativeTime, // 800 - 400
        })

        const sum = Object.values(result.subParts!).reduce((acc, curr) => acc + curr, 0)
        expect(sum + mockFirstByteValue).toBe(result.value)
      })
    })
  })
})
