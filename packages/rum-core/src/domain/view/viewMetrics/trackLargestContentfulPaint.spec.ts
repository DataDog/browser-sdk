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
  startTime: number
  requestStart: number
  responseEnd: number
}

interface StartLCPTrackingOptions {
  firstByte?: number
  resources?: ResourceEntryOptions[]
}

describe('trackLargestContentfulPaint', () => {
  let lcpCallback: jasmine.Spy<(lcp: LargestContentfulPaint) => void>
  let eventTarget: Window
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void
  let clock: Clock
  let mockSubParts: LargestContentfulPaint['subParts']

  function startLCPTracking(options: StartLCPTrackingOptions = {}) {
    const { firstByte = 789, resources = [] } = options

    ;({ notifyPerformanceEntries } = mockPerformanceObserver())

    // This ensures getNavigationEntry() returns controlled values for subParts calculation.
    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, { responseStart: firstByte as RelativeTime })])

    // Add resource entries to the global performance buffer so findLcpResourceEntry can find them
    // notifyPerformanceEntries adds entries to the global buffer via mockGlobalPerformanceBuffer
    for (const resource of resources) {
      notifyPerformanceEntries([
        createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
          name: 'https://example.com/image.jpg',
          startTime: resource.startTime as RelativeTime,
          requestStart: resource.requestStart as RelativeTime,
          responseEnd: resource.responseEnd as RelativeTime,
        }),
      ])
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
    addExperimentalFeatures([ExperimentalFeature.LCP_SUBPARTS])
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
    // Negative responseStart makes sanitizeFirstByte return undefined
    startLCPTracking({ firstByte: -1 })

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT)])

    expect(lcpCallback).toHaveBeenCalledOnceWith({
      value: 789 as RelativeTime,
      targetSelector: undefined,
      resourceUrl: undefined,
      subParts: undefined,
    })
  })

  describe('LCP subParts', () => {
    [
      {
        description: 'should cap lcpResponseEnd at LCP time for resources that complete after LCP',
        firstByte: 200,
        resource: {
          startTime: 500,
          requestStart: 500,
          responseEnd: 5000, // Continues downloading long after LCP
        },
        lcpTime: 1200,
        expectedSubParts: {
          loadDelay: 300, // 500 - 200
          loadTime: 700, // 1200 (capped) - 500
          renderDelay: 0, // 1200 - 1200 (capped) = 0
        },
      },
      {
        description: 'should not cap lcpResponseEnd when resource completes before LCP',
        firstByte: 200,
        resource: {
          startTime: 500,
          requestStart: 500,
          responseEnd: 1000,
        },
        lcpTime: 1200,
        expectedSubParts: {
          loadDelay: 300, // 500 - 200
          loadTime: 500, // 1000 - 500 (not capped)
          renderDelay: 200, // 1200 - 1000
        },
      },
      {
        description: 'should prefer requestStart over startTime when available (TAO enabled)',
        firstByte: 200,
        resource: {
          startTime: 500, // Resource discovered at 500ms
          requestStart: 700, // HTTP request started at 700ms (delayed)
          responseEnd: 1000,
        },
        lcpTime: 1200,
        expectedSubParts: {
          loadDelay: 500, // 700 (requestStart) - 200, not 300 (startTime - 200)
          loadTime: 300, // 1000 - 700 (requestStart)
          renderDelay: 200, // 1200 - 1000
        },
      },
      {
        description: 'should fallback to startTime when requestStart is 0 (cross-origin without TAO)',
        firstByte: 200,
        resource: {
          startTime: 500,
          requestStart: 0, // Not available (cross-origin without TAO)
          responseEnd: 1000,
        },
        lcpTime: 1200,
        expectedSubParts: {
          loadDelay: 300, // Falls back to: 500 (startTime) - 200
          loadTime: 500, // 1000 - 500 (startTime)
          renderDelay: 200, // 1200 - 1000
        },
      },
      {
        description: 'should handle TAO resource with normal completion',
        firstByte: 100,
        resource: {
          startTime: 200, // Resource discovered
          requestStart: 300, // HTTP request started (prefer this)
          responseEnd: 700, // Download completed
        },
        lcpTime: 900,
        expectedSubParts: {
          loadDelay: 200, // 300 - 100
          loadTime: 400, // 700 - 300
          renderDelay: 200, // 900 - 700
        },
      },
      {
        description: 'should handle resource that completes exactly at LCP time',
        firstByte: 100,
        resource: {
          startTime: 500,
          requestStart: 500,
          responseEnd: 1200, // Completes exactly at LCP time
        },
        lcpTime: 1200,
        expectedSubParts: {
          loadDelay: 400, // 500 - 100
          loadTime: 700, // 1200 - 500
          renderDelay: 0, // 1200 - 1200 = 0 (no render delay)
        },
      },
      {
        description: 'should handle LCP with no associated resource entry (text, data URL, inline image)',
        firstByte: 200,
        lcpTime: 1000,
        lcpUrl: '', // No resource
        expectedSubParts: {
          loadDelay: 0, // No resource, so max(firstByte, 0) - firstByte = 0
          loadTime: 0, // No resource, so max(firstByte, 0) - firstByte = 0
          renderDelay: 800, // 1000 - 200 (firstByte is used as lcpResponseEnd when no resource)
        },
      },
      {
        description: 'should handle cached resource with incomplete timing data (cross-origin without TAO)',
        firstByte: 150,
        resource: {
          startTime: 400,
          requestStart: 0, // Not available (cross-origin)
          responseEnd: 0, // Not available (cached)
        },
        lcpTime: 800,
        expectedSubParts: {
          // lcpRequestStart = max(150, 400 - 0) = 400 (falls back to startTime)
          loadDelay: 250, // 400 - 150
          // lcpResponseEnd = min(800, max(400, 0 - 0)) = min(800, 400) = 400
          loadTime: 0, // 400 - 400
          renderDelay: 400, // 800 - 400
        },
      },
    ].forEach(({ description, firstByte, resource, lcpTime, lcpUrl, expectedSubParts }) => {
      it(description, () => {
        startLCPTracking({
          firstByte,
          resources: resource ? [resource] : [],
        })

        notifyPerformanceEntries([
          createPerformanceEntry(RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT, {
            startTime: lcpTime as RelativeTime,
            url: lcpUrl === undefined ? 'https://example.com/image.jpg' : lcpUrl,
          }),
        ])

        const result = lcpCallback.calls.mostRecent().args[0]

        expect(result.subParts).toEqual(expectedSubParts as {
          loadDelay: RelativeTime
          loadTime: RelativeTime
          renderDelay: RelativeTime
        })

        // Validate: firstByte + loadDelay + loadTime + renderDelay = LCP value
        const sum = Object.values(result.subParts!).reduce((acc, curr) => acc + curr, 0)
        expect(sum + firstByte).toBe(result.value)
      })
    })
  })
})
