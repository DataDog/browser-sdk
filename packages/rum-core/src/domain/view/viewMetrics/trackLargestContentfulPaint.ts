import type { RelativeTime } from '@datadog/browser-core'
import {
  DOM_EVENT,
  ExperimentalFeature,
  ONE_MINUTE,
  addEventListeners,
  addTelemetryDebug,
  findLast,
  isExperimentalFeatureEnabled,
  relativeNow,
} from '@datadog/browser-core'
import { LifeCycleEventType } from '../../lifeCycle'
import type { LifeCycle } from '../../lifeCycle'
import type { RumConfiguration } from '../../configuration'
import { RumPerformanceEntryType } from '../../../browser/performanceCollection'
import type { RumLargestContentfulPaintTiming } from '../../../browser/performanceCollection'
import { getSelectorFromElement } from '../../getSelectorFromElement'
import type { FirstHidden } from './trackFirstHidden'

// Discard LCP timings above a certain delay to avoid incorrect data
// It happens in some cases like sleep mode or some browser implementations
export const LCP_MAXIMUM_DELAY = 10 * ONE_MINUTE

export interface LargestContentfulPaint {
  value: RelativeTime
  targetSelector?: string
}

type SerializableLCP = Omit<RumLargestContentfulPaintTiming, 'toJSON' | 'element'>

let wrongLcpReported = false
let previousLcp: SerializableLCP

/**
 * Track the largest contentful paint (LCP) occurring during the initial View.  This can yield
 * multiple values, only the most recent one should be used.
 * Documentation: https://web.dev/lcp/
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/master/src/onLCP.ts
 */
export function trackLargestContentfulPaint(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  firstHidden: FirstHidden,
  eventTarget: Window,
  callback: (largestContentfulPaint: LargestContentfulPaint) => void
) {
  // Ignore entries that come after the first user interaction. According to the documentation, the
  // browser should not send largest-contentful-paint entries after a user interact with the page,
  // but the web-vitals reference implementation uses this as a safeguard.
  let firstInteractionTimestamp = Infinity
  const { stop: stopEventListener } = addEventListeners(
    configuration,
    eventTarget,
    [DOM_EVENT.POINTER_DOWN, DOM_EVENT.KEY_DOWN],
    (event) => {
      firstInteractionTimestamp = event.timeStamp
    },
    { capture: true, once: true }
  )

  let biggestLcpSize = 0
  const { unsubscribe: unsubscribeLifeCycle } = lifeCycle.subscribe(
    LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED,
    (entries) => {
      const lcpEntry = findLast(
        entries,
        (entry): entry is RumLargestContentfulPaintTiming =>
          entry.entryType === RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT &&
          entry.startTime < firstInteractionTimestamp &&
          entry.startTime < firstHidden.timeStamp &&
          entry.startTime < LCP_MAXIMUM_DELAY &&
          // Ensure to get the LCP entry with the biggest size, see
          // https://bugs.chromium.org/p/chromium/issues/detail?id=1516655
          entry.size > biggestLcpSize
      )

      if (lcpEntry) {
        let lcpTargetSelector
        if (lcpEntry.element) {
          lcpTargetSelector = getSelectorFromElement(lcpEntry.element, configuration.actionNameAttribute)
        }

        if (isExperimentalFeatureEnabled(ExperimentalFeature.ZERO_LCP_TELEMETRY)) {
          monitorLcpEntries(
            lcpEntry,
            entries.filter(
              (entry): entry is RumLargestContentfulPaintTiming =>
                entry.entryType === RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT
            )
          )
        }

        callback({
          value: lcpEntry.startTime,
          targetSelector: lcpTargetSelector,
        })
        biggestLcpSize = lcpEntry.size
      }
    }
  )

  return {
    stop: () => {
      stopEventListener()
      unsubscribeLifeCycle()
    },
  }
}

function monitorLcpEntries(lcpEntry: RumLargestContentfulPaintTiming, lcpEntries: RumLargestContentfulPaintTiming[]) {
  if (wrongLcpReported) {
    return
  }

  const wrongLcpDetected =
    lcpEntry.startTime === 0
      ? 'LCP with startTime = 0'
      : previousLcp !== undefined && lcpEntry.startTime < previousLcp.startTime
        ? 'LCP with startTime < previous LCP'
        : previousLcp !== undefined && lcpEntry.size < previousLcp.size
          ? 'LCP with size < previous LCP'
          : undefined

  if (wrongLcpDetected) {
    wrongLcpReported = true

    addTelemetryDebug(wrongLcpDetected, {
      debug: {
        entry: toSerializableLCP(lcpEntry),
        previousLcp,
        timeOrigin: performance.timeOrigin,
        now: relativeNow(),
        lcpEntries: lcpEntries.map(toSerializableLCP),
      },
    })
  }

  previousLcp = toSerializableLCP(lcpEntry)
}

function toSerializableLCP(entry: RumLargestContentfulPaintTiming): SerializableLCP {
  const jsonEntry = entry.toJSON()
  delete jsonEntry.element
  return jsonEntry
}
