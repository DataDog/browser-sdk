import { type RelativeTime } from '@datadog/browser-core'
import type { RumPerformanceNavigationTiming } from './performanceObservable'
import { RumPerformanceEntryType } from './performanceObservable'
import { getNavigationEntry } from './performanceUtils'

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
