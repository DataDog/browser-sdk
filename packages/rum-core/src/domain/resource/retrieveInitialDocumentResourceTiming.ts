import type { RelativeTime } from '@datadog/browser-core'
import { assign, runOnReadyState } from '@datadog/browser-core'
import { supportPerformanceTimingEvent, RumPerformanceEntryType } from '../../browser/performanceObservable'
import type { RumPerformanceResourceTiming } from '../../browser/performanceObservable'
import type { RumConfiguration } from '../configuration'
import { getDocumentTraceId } from '../tracing/getDocumentTraceId'
import { FAKE_INITIAL_DOCUMENT, computeRelativePerformanceTiming } from './resourceUtils'

export function retrieveInitialDocumentResourceTiming(
  configuration: RumConfiguration,
  callback: (timing: RumPerformanceResourceTiming) => void
) {
  runOnReadyState(configuration, 'interactive', () => {
    let timing: RumPerformanceResourceTiming

    const forcedAttributes = {
      entryType: RumPerformanceEntryType.RESOURCE as const,
      initiatorType: FAKE_INITIAL_DOCUMENT,
      traceId: getDocumentTraceId(document),
      toJSON: () => assign({}, timing, { toJSON: undefined }),
    }
    if (
      supportPerformanceTimingEvent(RumPerformanceEntryType.NAVIGATION) &&
      performance.getEntriesByType(RumPerformanceEntryType.NAVIGATION).length > 0
    ) {
      const navigationEntry = performance.getEntriesByType(RumPerformanceEntryType.NAVIGATION)[0]
      timing = assign(navigationEntry.toJSON() as RumPerformanceResourceTiming, forcedAttributes)
    } else {
      const relativePerformanceTiming = computeRelativePerformanceTiming()
      timing = assign(
        relativePerformanceTiming,
        {
          decodedBodySize: 0,
          encodedBodySize: 0,
          transferSize: 0,
          renderBlockingStatus: 'non-blocking',
          duration: relativePerformanceTiming.responseEnd,
          name: window.location.href,
          startTime: 0 as RelativeTime,
        },
        forcedAttributes
      )
    }
    callback(timing)
  })
}
