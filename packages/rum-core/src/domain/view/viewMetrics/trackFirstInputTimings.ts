import type { Duration, RelativeTime } from '@datadog/browser-core'
import { elapsed, find, ExperimentalFeature, isExperimentalFeatureEnabled } from '@datadog/browser-core'
import { isElementNode } from '../../../browser/htmlDomUtils'
import type { RumConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import type { RumFirstInputTiming } from '../../../browser/performanceCollection'
import type { WebVitalTelemetryDebug } from '../startWebVitalTelemetryDebug'
import { getSelectorFromElement } from '../../getSelectorFromElement'
import type { FirstHidden } from './trackFirstHidden'

export interface FirstInputTimings {
  firstInputDelay: Duration
  firstInputTime: RelativeTime
  firstInputTargetSelector?: string
}

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
  webVitalTelemetryDebug: WebVitalTelemetryDebug,
  firstHidden: FirstHidden,
  callback: (firstInputTimings: FirstInputTimings) => void
) {
  const { unsubscribe: unsubscribeLifeCycle } = lifeCycle.subscribe(
    LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED,
    (entries) => {
      const firstInputEntry = find(
        entries,
        (entry): entry is RumFirstInputTiming =>
          entry.entryType === 'first-input' && entry.startTime < firstHidden.timeStamp
      )
      if (firstInputEntry) {
        const firstInputDelay = elapsed(firstInputEntry.startTime, firstInputEntry.processingStart)
        let firstInputTargetSelector

        if (
          isExperimentalFeatureEnabled(ExperimentalFeature.WEB_VITALS_ATTRIBUTION) &&
          firstInputEntry.target &&
          isElementNode(firstInputEntry.target)
        ) {
          firstInputTargetSelector = getSelectorFromElement(firstInputEntry.target, configuration.actionNameAttribute)
        }

        callback({
          // Ensure firstInputDelay to be positive, see
          // https://bugs.chromium.org/p/chromium/issues/detail?id=1185815
          firstInputDelay: firstInputDelay >= 0 ? firstInputDelay : (0 as Duration),
          firstInputTime: firstInputEntry.startTime,
          firstInputTargetSelector,
        })

        webVitalTelemetryDebug.addWebVitalTelemetryDebug('FID', firstInputEntry.target, firstInputEntry.startTime)
      }
    }
  )

  return {
    stop: unsubscribeLifeCycle,
  }
}
