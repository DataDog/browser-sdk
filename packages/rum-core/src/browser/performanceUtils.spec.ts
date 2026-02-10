import { type RelativeTime } from '@datadog/browser-core'
import { createPerformanceEntry, mockGlobalPerformanceBuffer } from '../../test'
import type { RumPerformanceNavigationTiming } from './performanceObservable'
import { RumPerformanceEntryType, supportPerformanceTimingEvent } from './performanceObservable'
import { findLcpResourceEntry, getNavigationEntry } from './performanceUtils'

describe('getNavigationEntry', () => {
  it('returns the navigation entry', () => {
    // Declare the expected value here, so TypeScript can make sure all expected fields are covered,
    // even though the actual value contains more fields.
    const expectation: jasmine.Expected<RumPerformanceNavigationTiming> = {
      entryType: RumPerformanceEntryType.NAVIGATION,
      initiatorType: 'navigation',
      name: jasmine.any(String),

      domComplete: jasmine.any(Number),
      domContentLoadedEventEnd: jasmine.any(Number),
      domInteractive: jasmine.any(Number),
      loadEventEnd: jasmine.any(Number),

      startTime: 0 as RelativeTime,
      duration: jasmine.any(Number),

      fetchStart: jasmine.any(Number),
      workerStart: jasmine.any(Number),
      domainLookupStart: jasmine.any(Number),
      domainLookupEnd: jasmine.any(Number),
      connectStart: jasmine.any(Number),
      secureConnectionStart: jasmine.any(Number),
      connectEnd: jasmine.any(Number),
      requestStart: jasmine.any(Number),
      responseStart: jasmine.any(Number),
      responseEnd: jasmine.any(Number),
      redirectStart: jasmine.any(Number),
      redirectEnd: jasmine.any(Number),

      toJSON: jasmine.any(Function),
    }

    const navigationEntry = getNavigationEntry()

    expect(navigationEntry).toEqual(jasmine.objectContaining(expectation))

    if (navigationEntry.decodedBodySize) {
      expect(navigationEntry.decodedBodySize).toEqual(jasmine.any(Number))
    }
    if (navigationEntry.encodedBodySize) {
      expect(navigationEntry.encodedBodySize).toEqual(jasmine.any(Number))
    }
    if (navigationEntry.transferSize) {
      expect(navigationEntry.transferSize).toEqual(jasmine.any(Number))
    }
  })
})

describe('findLcpResourceEntry', () => {
  beforeEach(() => {
    if (!supportPerformanceTimingEvent(RumPerformanceEntryType.RESOURCE)) {
      pending('Resource Timing Event is not supported in this browser')
    }
  })

  it('should return undefined when no resource entries exist', () => {
    mockGlobalPerformanceBuffer([])

    const result = findLcpResourceEntry('https://example.com/image.jpg', 1000 as RelativeTime)

    expect(result).toBeUndefined()
  })

  it('should return undefined when no matching URL is found', () => {
    mockGlobalPerformanceBuffer([
      createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
        name: 'https://example.com/foo.jpg',
        startTime: 100 as RelativeTime,
      }),
    ])

    const result = findLcpResourceEntry('https://example.com/image.jpg', 1000 as RelativeTime)

    expect(result).toBeUndefined()
  })

  it('should return the matching resource entry', () => {
    mockGlobalPerformanceBuffer([
      createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
        name: 'https://example.com/image.jpg',
        startTime: 100 as RelativeTime,
      }),
    ])

    const result = findLcpResourceEntry('https://example.com/image.jpg', 1000 as RelativeTime)

    expect(result).toBeDefined()
    expect(result!.name).toBe('https://example.com/image.jpg')
  })

  it('should return the most recent matching entry when multiple entries exist for the same URL', () => {
    mockGlobalPerformanceBuffer([
      createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
        name: 'https://example.com/image.jpg',
        startTime: 100 as RelativeTime,
        responseEnd: 200 as RelativeTime,
      }),
      createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
        name: 'https://example.com/image.jpg',
        startTime: 500 as RelativeTime,
        responseEnd: 600 as RelativeTime,
      }),
    ])

    const result = findLcpResourceEntry('https://example.com/image.jpg', 1000 as RelativeTime)

    expect(result).toBeDefined()
    expect(result!.startTime).toBe(500 as RelativeTime)
  })

  it('should ignore resource entries that started after LCP time', () => {
    mockGlobalPerformanceBuffer([
      createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
        name: 'https://example.com/image.jpg',
        startTime: 100 as RelativeTime,
        responseEnd: 200 as RelativeTime,
      }),
      createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
        name: 'https://example.com/image.jpg',
        startTime: 1500 as RelativeTime,
        responseEnd: 1600 as RelativeTime,
      }),
      createPerformanceEntry(RumPerformanceEntryType.RESOURCE, {
        name: 'https://example.com/image.jpg',
        startTime: 1500 as RelativeTime,
      }),
    ])

    const result = findLcpResourceEntry('https://example.com/image.jpg', 1000 as RelativeTime)

    expect(result).toBeDefined()
    expect(result!.startTime).toBe(100 as RelativeTime)
  })
})
