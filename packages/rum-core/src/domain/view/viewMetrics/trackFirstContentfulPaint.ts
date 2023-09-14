import type { RelativeTime } from '@datadog/browser-core'
import { ONE_MINUTE, find } from '@datadog/browser-core'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import type { RumPerformancePaintTiming } from '../../../browser/performanceCollection'
import { RumPerformanceEntryType } from '../../../browser/performanceCollection'
import type { FirstHidden } from './trackFirstHidden'

// Discard FCP timings above a certain delay to avoid incorrect data
// It happens in some cases like sleep mode or some browser implementations
export const FCP_MAXIMUM_DELAY = 10 * ONE_MINUTE

export function trackFirstContentfulPaint(
  lifeCycle: LifeCycle,
  firstHidden: FirstHidden,
  callback: (fcpTiming: RelativeTime) => void
) {
  const { unsubscribe: unsubscribeLifeCycle } = lifeCycle.subscribe(
    LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED,
    (entries) => {
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
    }
  )
  return {
    stop: unsubscribeLifeCycle,
  }
}
