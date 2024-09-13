import type { RelativeTime } from '@datadog/browser-core'
import { ONE_MINUTE, find } from '@datadog/browser-core'
import type { RumPerformancePaintTiming } from '../../../browser/performanceObservable'
import { createPerformanceObservable, RumPerformanceEntryType } from '../../../browser/performanceObservable'
import type { RumConfiguration } from '../../configuration'
import type { FirstHidden } from './trackFirstHidden'

// Discard FCP timings above a certain delay to avoid incorrect data
// It happens in some cases like sleep mode or some browser implementations
export const FCP_MAXIMUM_DELAY = 10 * ONE_MINUTE

export function trackFirstContentfulPaint(
  configuration: RumConfiguration,
  firstHidden: FirstHidden,
  callback: (fcpTiming: RelativeTime) => void
) {
  const performanceSubscription = createPerformanceObservable(configuration, {
    type: RumPerformanceEntryType.PAINT,
    buffered: true,
  }).subscribe((entries) => {
    const fcpEntry = find(
      entries,
      (entry): entry is RumPerformancePaintTiming =>
        entry.entryType === RumPerformanceEntryType.PAINT &&
        entry.name === 'first-contentful-paint' &&
        entry.startTime < firstHidden.timeStamp &&
        entry.startTime < FCP_MAXIMUM_DELAY
    )
    if (fcpEntry) {
      callback(fcpEntry.startTime)
    }
  })
  return {
    stop: performanceSubscription.unsubscribe,
  }
}
