import { round, type RelativeTime, find, ONE_SECOND } from '@datadog/browser-core'
import type { LifeCycle } from '../../../lifeCycle'
import { LifeCycleEventType } from '../../../lifeCycle'
import { supportPerformanceTimingEvent, type RumLayoutShiftTiming } from '../../../../browser/performanceCollection'

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
  lifeCycle: LifeCycle,
  callback: (layoutShift: number, largestShiftNode: Node | undefined, largestShiftTime: RelativeTime) => void
) {
  let maxClsValue = 0

  const window = slidingSessionWindow()
  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    for (const entry of entries) {
      if (entry.entryType === 'layout-shift' && !entry.hadRecentInput) {
        window.update(entry)

        if (window.value() > maxClsValue) {
          maxClsValue = window.value()
          callback(round(maxClsValue, 4), window.largestLayoutShiftNode(), window.largestLayoutShiftTime())
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
  let largestLayoutShiftNode: Node | undefined
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
        largestLayoutShiftNode = undefined
      } else {
        value += entry.value
        endTime = entry.startTime
      }

      if (entry.value > largestLayoutShift) {
        largestLayoutShift = entry.value
        largestLayoutShiftTime = entry.startTime

        if (entry.sources?.length) {
          const largestLayoutShiftSource = find(entry.sources, (s) => s.node?.nodeType === 1) || entry.sources[0]
          largestLayoutShiftNode = largestLayoutShiftSource.node
        } else {
          largestLayoutShiftNode = undefined
        }
      }
    },
    value: () => value,
    largestLayoutShiftNode: () => largestLayoutShiftNode,
    largestLayoutShiftTime: () => largestLayoutShiftTime,
  }
}

/**
 * Check whether `layout-shift` is supported by the browser.
 */
export function isLayoutShiftSupported() {
  return supportPerformanceTimingEvent('layout-shift')
}
