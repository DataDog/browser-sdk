import {
  round,
  type RelativeTime,
  find,
  ONE_SECOND,
  isExperimentalFeatureEnabled,
  ExperimentalFeature,
  noop,
} from '@datadog/browser-core'
import { isElementNode } from '../../../browser/htmlDomUtils'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import type { RumLayoutShiftTiming } from '../../../browser/performanceCollection'
import { supportPerformanceTimingEvent, RumPerformanceEntryType } from '../../../browser/performanceCollection'
import { getSelectorFromElement } from '../../getSelectorFromElement'
import type { RumConfiguration } from '../../configuration'

export interface CumulativeLayoutShift {
  value: number
  targetSelector?: string
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
  lifeCycle: LifeCycle,
  callback: (cumulativeLayoutShift: CumulativeLayoutShift) => void
) {
  if (!isLayoutShiftSupported()) {
    return {
      stop: noop,
    }
  }

  let maxClsValue = 0

  // if no layout shift happen the value should be reported as 0
  callback({
    value: 0,
  })

  const window = slidingSessionWindow()

  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    for (const entry of entries) {
      if (entry.entryType === RumPerformanceEntryType.LAYOUT_SHIFT && !entry.hadRecentInput) {
        window.update(entry)

        if (window.value() > maxClsValue) {
          maxClsValue = window.value()
          const cls = round(maxClsValue, 4)
          const clsTarget = window.largestLayoutShiftTarget()
          let cslTargetSelector

          if (isExperimentalFeatureEnabled(ExperimentalFeature.WEB_VITALS_ATTRIBUTION) && clsTarget) {
            cslTargetSelector = getSelectorFromElement(clsTarget, configuration.actionNameAttribute)
          }

          callback({
            value: cls,
            targetSelector: cslTargetSelector,
          })
        }
      }
    }
  })

  return {
    stop,
  }
}

function slidingSessionWindow() {
  let value = 0
  let startTime: RelativeTime
  let endTime: RelativeTime

  let largestLayoutShift = 0
  let largestLayoutShiftTarget: HTMLElement | undefined
  let largestLayoutShiftTime: RelativeTime

  return {
    update: (entry: RumLayoutShiftTiming) => {
      const shouldCreateNewWindow =
        startTime === undefined ||
        entry.startTime - endTime >= ONE_SECOND ||
        entry.startTime - startTime >= 5 * ONE_SECOND
      if (shouldCreateNewWindow) {
        startTime = endTime = entry.startTime
        value = entry.value
        largestLayoutShift = 0
        largestLayoutShiftTarget = undefined
      } else {
        value += entry.value
        endTime = entry.startTime
      }

      if (entry.value > largestLayoutShift) {
        largestLayoutShift = entry.value
        largestLayoutShiftTime = entry.startTime

        if (entry.sources?.length) {
          largestLayoutShiftTarget = find(
            entry.sources,
            (s): s is { node: HTMLElement } => !!s.node && isElementNode(s.node)
          )?.node
        } else {
          largestLayoutShiftTarget = undefined
        }
      }
    },
    value: () => value,
    largestLayoutShiftTarget: () => largestLayoutShiftTarget,
    largestLayoutShiftTime: () => largestLayoutShiftTime,
  }
}

/**
 * Check whether `layout-shift` is supported by the browser.
 */
export function isLayoutShiftSupported() {
  return supportPerformanceTimingEvent(RumPerformanceEntryType.LAYOUT_SHIFT)
}
