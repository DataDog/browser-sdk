import { isIE, type RelativeTime } from '@datadog/browser-core'
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
      domainLookupStart: jasmine.any(Number),
      domainLookupEnd: jasmine.any(Number),
      connectStart: jasmine.any(Number),
      ...(isIE()
        ? ({} as unknown as { secureConnectionStart: RelativeTime })
        : { secureConnectionStart: jasmine.any(Number) }),
      connectEnd: jasmine.any(Number),
      requestStart: jasmine.any(Number),
      responseStart: jasmine.any(Number),
      responseEnd: jasmine.any(Number),
      redirectStart: jasmine.any(Number),
      redirectEnd: jasmine.any(Number),
      decodedBodySize: jasmine.any(Number),
      encodedBodySize: jasmine.any(Number),
      transferSize: jasmine.any(Number),

      toJSON: jasmine.any(Function),
    }

    expect(getNavigationEntry()).toEqual(jasmine.objectContaining(expectation))
  })
})
