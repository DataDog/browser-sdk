import { elapsed, noop } from '@datadog/browser-core'
import type { Duration, RelativeTime } from '@datadog/browser-core'
// eslint-disable-next-line local-rules/disallow-side-effects
import { onCLS } from 'web-vitals/attribution'
import { isElementNode } from '../../../browser/htmlDomUtils'
import { supportPerformanceTimingEvent, RumPerformanceEntryType } from '../../../browser/performanceCollection'
import type { RumConfiguration } from '../../configuration'
import { getSelectorFromElement } from '../../getSelectorFromElement'

export interface CumulativeLayoutShift {
  value: number
  targetSelector?: string
  time?: Duration
}

/**
 * Track the cumulative layout shifts (CLS).
 * Layout shifts are grouped into session windows.
 * The minimum gap between session windows is 1 second.
 * The maximum duration of a session window is 5 second.
 * The session window layout shift value is the sum of layout shifts inside it.
 * The CLS value is the max of session windows values.
 *
 * This yields a new value whenever the CLS value is updated (a higher session window value is computed).
 *
 * See isLayoutShiftSupported to check for browser support.
 *
 * Documentation:
 * https://web.dev/cls/
 * https://web.dev/evolving-cls/
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/master/src/getCLS.ts
 */
export function trackCumulativeLayoutShift(
  configuration: RumConfiguration,
  viewStart: RelativeTime,
  callback: (cumulativeLayoutShift: CumulativeLayoutShift) => void
) {
  if (!isLayoutShiftSupported()) {
    return {
      stop: noop,
    }
  }

  onCLS(
    (layoutShift) => {
      const { largestShiftTime, largestShiftValue, largestShiftSource } = layoutShift.attribution
      if (!largestShiftValue || !largestShiftTime) {
        return
      }

      callback({
        value: layoutShift.value,
        targetSelector:
          (largestShiftSource &&
            largestShiftSource.node &&
            isElementNode(largestShiftSource.node) &&
            getSelectorFromElement(largestShiftSource.node, configuration.actionNameAttribute)) ||
          undefined,
        time: elapsed(viewStart, largestShiftTime as RelativeTime),
      })
    },
    { reportAllChanges: true }
  )

  return {
    stop,
  }
}

/**
 * Check whether `layout-shift` is supported by the browser.
 */
export function isLayoutShiftSupported() {
  return supportPerformanceTimingEvent(RumPerformanceEntryType.LAYOUT_SHIFT)
}
