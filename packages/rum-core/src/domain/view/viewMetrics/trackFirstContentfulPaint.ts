import type { Duration, RelativeTime } from '@datadog/browser-core'
import { ONE_MINUTE, elapsed, relativeNow } from '@datadog/browser-core'
import type { RumPerformancePaintTiming } from '../../../browser/performanceObservable'
import { createPerformanceObservable, RumPerformanceEntryType } from '../../../browser/performanceObservable'
import type { RumConfiguration } from '../../configuration'
import type { FirstHidden } from './trackFirstHidden'
import { getActivationStart } from 'packages/rum-core/src/browser/performanceUtils'

// Discard FCP timings above a certain delay to avoid incorrect data
// It happens in some cases like sleep mode or some browser implementations
export const FCP_MAXIMUM_DELAY = 10 * ONE_MINUTE

export function trackFirstContentfulPaint(
  configuration: RumConfiguration,
  firstHidden: FirstHidden,
  callback: (fcpTiming: RelativeTime) => void,
  getActivationStartImpl = getActivationStart
) {
  const activationStart = getActivationStartImpl()

  const performanceSubscription = createPerformanceObservable(configuration, {
    type: RumPerformanceEntryType.PAINT,
    buffered: true,
  }).subscribe((entries) => {
    const fcpEntry = entries.find(
      (entry): entry is RumPerformancePaintTiming =>
        entry.name === 'first-contentful-paint' &&
        entry.startTime < firstHidden.timeStamp &&
        entry.startTime < FCP_MAXIMUM_DELAY
    )
    if (fcpEntry) {
      const adjustedFcp = activationStart > 0 ? Math.max(0, fcpEntry.startTime - activationStart) : fcpEntry.startTime
      callback(adjustedFcp as RelativeTime)
    }
  })
  return {
    stop: performanceSubscription.unsubscribe,
  }
}

/**
 * Measure the First Contentful Paint after a BFCache restoration.
 * The DOM is restored synchronously, so we approximate the FCP with the first frame
 * rendered just after the pageshow event, using two nested requestAnimationFrame calls.
 */
export function trackRestoredFirstContentfulPaint(viewStartRelative: RelativeTime, callback: (fcp: Duration) => void) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      callback(elapsed(viewStartRelative, relativeNow()))
    })
  })
}
