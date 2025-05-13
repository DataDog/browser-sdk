import type { Duration, RelativeTime } from '@flashcatcloud/browser-core'
import { elapsed } from '@flashcatcloud/browser-core'
import { isElementNode } from '../../../browser/htmlDomUtils'
import type { RumConfiguration } from '../../configuration'
import { createPerformanceObservable, RumPerformanceEntryType } from '../../../browser/performanceObservable'
import type { RumFirstInputTiming } from '../../../browser/performanceObservable'
import { getSelectorFromElement } from '../../getSelectorFromElement'
import type { FirstHidden } from './trackFirstHidden'

export interface FirstInput {
  delay: Duration
  time: RelativeTime
  targetSelector?: string
}

/**
 * Track the first input occurring during the initial View to return:
 * - First Input Delay
 * - First Input Time
 * Callback is called at most one time.
 * Documentation: https://web.dev/fid/
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/master/src/getFID.ts
 */
export function trackFirstInput(
  configuration: RumConfiguration,
  firstHidden: FirstHidden,
  callback: (firstInput: FirstInput) => void
) {
  const performanceFirstInputSubscription = createPerformanceObservable(configuration, {
    type: RumPerformanceEntryType.FIRST_INPUT,
    buffered: true,
  }).subscribe((entries) => {
    const firstInputEntry = entries.find(
      (entry): entry is RumFirstInputTiming => entry.startTime < firstHidden.timeStamp
    )
    if (firstInputEntry) {
      const firstInputDelay = elapsed(firstInputEntry.startTime, firstInputEntry.processingStart)
      let firstInputTargetSelector

      if (firstInputEntry.target && isElementNode(firstInputEntry.target)) {
        firstInputTargetSelector = getSelectorFromElement(firstInputEntry.target, configuration.actionNameAttribute)
      }

      callback({
        // Ensure firstInputDelay to be positive, see
        // https://bugs.chromium.org/p/chromium/issues/detail?id=1185815
        delay: firstInputDelay >= 0 ? firstInputDelay : (0 as Duration),
        time: firstInputEntry.startTime,
        targetSelector: firstInputTargetSelector,
      })
    }
  })

  return {
    stop: () => {
      performanceFirstInputSubscription.unsubscribe()
    },
  }
}
