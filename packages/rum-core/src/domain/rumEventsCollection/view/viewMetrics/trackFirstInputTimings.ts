import type { Duration, RelativeTime } from '@datadog/browser-core'
import { elapsed, find } from '@datadog/browser-core'
import type { RumConfiguration } from '../../../configuration'
import type { LifeCycle } from '../../../lifeCycle'
import { LifeCycleEventType } from '../../../lifeCycle'
import type { RumFirstInputTiming } from '../../../../browser/performanceCollection'
import { trackFirstHidden } from './trackFirstHidden'

/**
 * Track the first input occurring during the initial View to return:
 * - First Input Delay
 * - First Input Time
 * Callback is called at most one time.
 * Documentation: https://web.dev/fid/
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/master/src/getFID.ts
 */

export function trackFirstInputTimings(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  callback: ({
    firstInputDelay,
    firstInputTime,
    firstInputTarget,
  }: {
    firstInputDelay: Duration
    firstInputTime: RelativeTime
    firstInputTarget: Node | undefined
  }) => void
) {
  const firstHidden = trackFirstHidden(configuration)

  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    const firstInputEntry = find(
      entries,
      (entry): entry is RumFirstInputTiming =>
        entry.entryType === 'first-input' && entry.startTime < firstHidden.timeStamp
    )
    if (firstInputEntry) {
      const firstInputDelay = elapsed(firstInputEntry.startTime, firstInputEntry.processingStart)
      callback({
        // Ensure firstInputDelay to be positive, see
        // https://bugs.chromium.org/p/chromium/issues/detail?id=1185815
        firstInputDelay: firstInputDelay >= 0 ? firstInputDelay : (0 as Duration),
        firstInputTime: firstInputEntry.startTime,
        firstInputTarget: firstInputEntry.target,
      })
    }
  })

  return {
    stop,
  }
}
