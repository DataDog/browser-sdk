import { beforeEach, describe, expect, it } from 'vitest'
import { type RelativeTime } from '@datadog/js-core/time'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { createPerformanceEntry, mockGlobalPerformanceBuffer } from '../../test'
import type { RumPerformanceNavigationTiming } from './performanceObservable'
import { RumPerformanceEntryType } from './performanceObservable'
import { findLcpResourceEntry, getNavigationEntry } from './performanceUtils'

describe('getNavigationEntry', () => {
  it('returns the navigation entry', () => {
    // Declare the expected value here, so TypeScript can make sure all expected fields are covered,
    // even though the actual value contains more fields.
    const expectation: RumPerformanceNavigationTiming = {
      entryType: RumPerformanceEntryType.NAVIGATION,
      initiatorType: 'navigation',
      name: expect.any(String),

      domComplete: expect.any(Number),
      domContentLoadedEventEnd: expect.any(Number),
      domInteractive: expect.any(Number),
      loadEventEnd: expect.any(Number),

      startTime: 0 as RelativeTime,
      duration: expect.any(Number),

      fetchStart: expect.any(Number),
      workerStart: expect.any(Number),
      domainLookupStart: expect.any(Number),
      domainLookupEnd: expect.any(Number),
      connectStart: expect.any(Number),
      secureConnectionStart: expect.any(Number),
      connectEnd: expect.any(Number),
      requestStart: expect.any(Number),
      responseStart: expect.any(Number),
      responseEnd: expect.any(Number),
      redirectStart: expect.any(Number),
      redirectEnd: expect.any(Number),

      toJSON: expect.any(Function),
    }

    const navigationEntry = getNavigationEntry()

    expect(navigationEntry).toEqual(expect.objectContaining(expectation))

    if (navigationEntry.decodedBodySize) {
      expect(navigationEntry.decodedBodySize).toEqual(expect.any(Number))
    }
    if (navigationEntry.encodedBodySize) {
      expect(navigationEntry.encodedBodySize).toEqual(expect.any(Number))
    }
    if (navigationEntry.transferSize) {
      expect(navigationEntry.transferSize).toEqual(expect.any(Number))
    }
  })

  describe('when navigation entry has broken DOM timings (WebKit 26.4)', () => {
    let originalSupportedEntryTypes: string[] | undefined
    let originalTiming: PerformanceTiming

    beforeEach(() => {
      originalSupportedEntryTypes = PerformanceObserver.supportedEntryTypes as string[]
      Object.defineProperty(PerformanceObserver, 'supportedEntryTypes', {
        get: () => [...(originalSupportedEntryTypes || []), RumPerformanceEntryType.NAVIGATION],
        configurable: true,
      })

      mockGlobalPerformanceBuffer([
        createPerformanceEntry(RumPerformanceEntryType.NAVIGATION, {
          domComplete: 0 as RelativeTime,
          domContentLoadedEventEnd: 0 as RelativeTime,
          domInteractive: 0 as RelativeTime,
          loadEventEnd: 32 as RelativeTime,
          responseStart: 6 as RelativeTime,
        }),
      ])

      originalTiming = performance.timing
      const navigationStart = originalTiming.navigationStart
      Object.defineProperty(performance, 'timing', {
        configurable: true,
        value: {
          ...originalTiming,
          navigationStart,
          domComplete: navigationStart + 456,
          domContentLoadedEventEnd: navigationStart + 345,
          domInteractive: navigationStart + 234,
          loadEventEnd: navigationStart + 567,
          responseStart: navigationStart + 123,
        },
      })

      registerCleanupTask(() => {
        Object.defineProperty(performance, 'timing', { configurable: true, value: originalTiming })
        if (originalSupportedEntryTypes !== undefined) {
          Object.defineProperty(PerformanceObserver, 'supportedEntryTypes', {
            get: () => originalSupportedEntryTypes,
            configurable: true,
          })
        }
      })
    })

    it('falls back to deprecated performance timing', () => {
      const navigationEntry = getNavigationEntry()

      expect(navigationEntry.domComplete).toBe(456 as RelativeTime)
      expect(navigationEntry.domContentLoadedEventEnd).toBe(345 as RelativeTime)
      expect(navigationEntry.domInteractive).toBe(234 as RelativeTime)
      expect(navigationEntry.loadEventEnd).toBe(567 as RelativeTime)
    })
  })
})

describe('findLcpResourceEntry', () => {
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
