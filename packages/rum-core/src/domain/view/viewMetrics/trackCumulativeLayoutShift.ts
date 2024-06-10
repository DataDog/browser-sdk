import { round, find, ONE_SECOND, noop, elapsed } from '@datadog/browser-core'
import type { Duration, RelativeTime, WeakRef, WeakRefConstructor } from '@datadog/browser-core'
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
  time?: Duration
}

declare const WeakRef: WeakRefConstructor

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
  viewStart: RelativeTime,
  callback: (cumulativeLayoutShift: CumulativeLayoutShift) => void
) {
  if (!isLayoutShiftSupported()) {
    return {
      stop: noop,
    }
  }

  let maxClsValue = 0
  // WeakRef is not supported in IE11 and Safari mobile, but so is the layout shift API, so this code won't be executed in these browsers
  let maxClsTarget: WeakRef<HTMLElement> | undefined
  let maxClsStartTime: Duration | undefined

  // if no layout shift happen the value should be reported as 0
  callback({
    value: 0,
  })

  const window = slidingSessionWindow()
  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    for (const entry of entries) {
      if (entry.entryType === RumPerformanceEntryType.LAYOUT_SHIFT && !entry.hadRecentInput) {
        const { cumulatedValue, isMaxValue } = window.update(entry)

        if (isMaxValue) {
          const target = getTargetFromSource(entry.sources)
          maxClsTarget = target ? new WeakRef(target) : undefined
          maxClsStartTime = elapsed(viewStart, entry.startTime)
        }

        if (cumulatedValue > maxClsValue) {
          maxClsValue = cumulatedValue
          const target = maxClsTarget?.deref()

          callback({
            value: round(maxClsValue, 4),
            targetSelector: target && getSelectorFromElement(target, configuration.actionNameAttribute),
            time: maxClsStartTime,
          })
        }
      }
    }
  })

  return {
    stop,
  }
}

function getTargetFromSource(sources?: Array<{ node?: Node }>) {
  if (!sources) {
    return
  }

  return find(sources, (source): source is { node: HTMLElement } => !!source.node && isElementNode(source.node))?.node
}

export const MAX_WINDOW_DURATION = 5 * ONE_SECOND
const MAX_UPDATE_GAP = ONE_SECOND

function slidingSessionWindow() {
  let cumulatedValue = 0
  let startTime: RelativeTime
  let endTime: RelativeTime
  let maxValue = 0

  return {
    update: (entry: RumLayoutShiftTiming) => {
      const shouldCreateNewWindow =
        startTime === undefined ||
        entry.startTime - endTime >= MAX_UPDATE_GAP ||
        entry.startTime - startTime >= MAX_WINDOW_DURATION

      let isMaxValue: boolean

      if (shouldCreateNewWindow) {
        startTime = endTime = entry.startTime
        maxValue = cumulatedValue = entry.value
        isMaxValue = true
      } else {
        cumulatedValue += entry.value
        endTime = entry.startTime
        isMaxValue = entry.value > maxValue

        if (isMaxValue) {
          maxValue = entry.value
        }
      }

      return {
        cumulatedValue,
        isMaxValue,
      }
    },
  }
}

/**
 * Check whether `layout-shift` is supported by the browser.
 */
export function isLayoutShiftSupported() {
  return supportPerformanceTimingEvent(RumPerformanceEntryType.LAYOUT_SHIFT)
}
