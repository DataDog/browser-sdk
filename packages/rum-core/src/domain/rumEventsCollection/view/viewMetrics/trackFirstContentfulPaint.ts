import type { RelativeTime } from '@datadog/browser-core'
import { ONE_MINUTE, find } from '@datadog/browser-core'
import type { RumConfiguration } from '../../../configuration'
import type { LifeCycle } from '../../../lifeCycle'
import { LifeCycleEventType } from '../../../lifeCycle'
import type { RumPerformancePaintTiming } from '../../../../browser/performanceCollection'
import { trackFirstHidden } from './trackFirstHidden'

// Discard FCP timings above a certain delay to avoid incorrect data
// It happens in some cases like sleep mode or some browser implementations
export const FCP_MAXIMUM_DELAY = 10 * ONE_MINUTE

export function trackFirstContentfulPaint(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  callback: (fcpTiming: RelativeTime) => void
) {
  const firstHidden = trackFirstHidden(configuration)
  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    const fcpEntry = find(
      entries,
      (entry): entry is RumPerformancePaintTiming =>
        entry.entryType === 'paint' &&
        entry.name === 'first-contentful-paint' &&
        entry.startTime < firstHidden.timeStamp &&
        entry.startTime < FCP_MAXIMUM_DELAY
    )
    if (fcpEntry) {
      callback(fcpEntry.startTime)
    }
  })
  return { stop }
}
