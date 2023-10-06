import {
  noop,
  isExperimentalFeatureEnabled,
  ExperimentalFeature,
  ONE_MINUTE,
  addTelemetryDebug,
  elapsed,
} from '@datadog/browser-core'
import type { ClocksState, Duration } from '@datadog/browser-core'
import { RumPerformanceEntryType, supportPerformanceTimingEvent } from '../../../browser/performanceCollection'
import type { RumFirstInputTiming, RumPerformanceEventTiming } from '../../../browser/performanceCollection'
import { LifeCycleEventType } from '../../lifeCycle'
import type { LifeCycle } from '../../lifeCycle'
import { ViewLoadingType } from '../../../rawRumEvent.types'
import { getSelectorFromElement } from '../../getSelectorFromElement'
import { isElementNode } from '../../../browser/htmlDomUtils'
import type { RumConfiguration } from '../../configuration'
import { getInteractionCount, initInteractionCountPolyfill } from './interactionCountPolyfill'

// Arbitrary value to prevent unnecessary memory usage on views with lots of interactions.
const MAX_INTERACTION_ENTRIES = 10

export interface InteractionToNextPaint {
  value: Duration
  targetSelector?: string
}
/**
 * Track the interaction to next paint (INP).
 * To avoid outliers, return the p98 worst interaction of the view.
 * Documentation: https://web.dev/inp/
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/main/src/onINP.ts
 */
export function trackInteractionToNextPaint(
  configuration: RumConfiguration,
  viewStart: ClocksState,
  viewLoadingType: ViewLoadingType,
  lifeCycle: LifeCycle
) {
  if (
    !isInteractionToNextPaintSupported() ||
    !isExperimentalFeatureEnabled(ExperimentalFeature.INTERACTION_TO_NEXT_PAINT)
  ) {
    return {
      getInteractionToNextPaint: () => undefined,
      stop: noop,
    }
  }

  const { getViewInteractionCount } = trackViewInteractionCount(viewLoadingType)
  const longestInteractions = trackLongestInteractions(getViewInteractionCount)
  let interactionToNextPaint = -1 as Duration
  let interactionToNextPaintTargetSelector: string | undefined
  let telemetryCollected = false

  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    for (const entry of entries) {
      if (
        (entry.entryType === RumPerformanceEntryType.EVENT ||
          entry.entryType === RumPerformanceEntryType.FIRST_INPUT) &&
        entry.interactionId
      ) {
        longestInteractions.process(entry)
      }
    }

    const newInteraction = longestInteractions.estimateP98Interaction()
    if (newInteraction) {
      interactionToNextPaint = newInteraction.duration
      if (interactionToNextPaint > 10 * ONE_MINUTE && !telemetryCollected) {
        telemetryCollected = true
        addTelemetryDebug('INP outlier', {
          inp: interactionToNextPaint,
          interaction: {
            timeFromViewStart: elapsed(viewStart.relative, newInteraction.startTime),
            duration: newInteraction.duration,
            startTime: newInteraction.startTime,
            processingStart: newInteraction.processingStart,
            processingEnd: newInteraction.processingEnd,
            interactionId: newInteraction.interactionId,
            name: newInteraction.name,
            targetNodeName: newInteraction.target?.nodeName,
          },
        })
      }

      if (
        isExperimentalFeatureEnabled(ExperimentalFeature.WEB_VITALS_ATTRIBUTION) &&
        newInteraction.target &&
        isElementNode(newInteraction.target)
      ) {
        interactionToNextPaintTargetSelector = getSelectorFromElement(
          newInteraction.target,
          configuration.actionNameAttribute
        )
      } else {
        interactionToNextPaintTargetSelector = undefined
      }
    }
  })

  return {
    getInteractionToNextPaint: (): InteractionToNextPaint | undefined => {
      // If no INP duration where captured because of the performanceObserver 40ms threshold
      // but the view interaction count > 0 then report 0
      if (interactionToNextPaint >= 0) {
        return {
          value: interactionToNextPaint,
          targetSelector: interactionToNextPaintTargetSelector,
        }
      } else if (getViewInteractionCount()) {
        return {
          value: 0 as Duration,
        }
      }
    },
    stop,
  }
}

function trackLongestInteractions(getViewInteractionCount: () => number) {
  const longestInteractions: Array<RumPerformanceEventTiming | RumFirstInputTiming> = []

  function sortAndTrimLongestInteractions() {
    longestInteractions.sort((a, b) => b.duration - a.duration).splice(MAX_INTERACTION_ENTRIES)
  }

  return {
    /**
     * Process the performance entry:
     * - if its duration is long enough, add the performance entry to the list of worst interactions
     * - if an entry with the same interaction id exists and its duration is lower than the new one, then replace it in the list of worst interactions
     */
    process(entry: RumPerformanceEventTiming | RumFirstInputTiming) {
      const interactionIndex = longestInteractions.findIndex(
        (interaction) => entry.interactionId === interaction.interactionId
      )

      const minLongestInteraction = longestInteractions[longestInteractions.length - 1]

      if (interactionIndex !== -1) {
        if (entry.duration > longestInteractions[interactionIndex].duration) {
          longestInteractions[interactionIndex] = entry
          sortAndTrimLongestInteractions()
        }
      } else if (
        longestInteractions.length < MAX_INTERACTION_ENTRIES ||
        entry.duration > minLongestInteraction.duration
      ) {
        longestInteractions.push(entry)
        sortAndTrimLongestInteractions()
      }
    },
    /**
     * Compute the p98 longest interaction.
     * For better performance the computation is based on 10 longest interactions and the interaction count of the current view.
     */
    estimateP98Interaction(): RumPerformanceEventTiming | RumFirstInputTiming | undefined {
      const interactionIndex = Math.min(longestInteractions.length - 1, Math.floor(getViewInteractionCount() / 50))
      return longestInteractions[interactionIndex]
    },
  }
}

export function trackViewInteractionCount(viewLoadingType: ViewLoadingType) {
  initInteractionCountPolyfill()
  const previousInteractionCount = viewLoadingType === ViewLoadingType.INITIAL_LOAD ? 0 : getInteractionCount()
  return {
    getViewInteractionCount: () => getInteractionCount()! - previousInteractionCount,
  }
}

export function isInteractionToNextPaintSupported() {
  return (
    supportPerformanceTimingEvent(RumPerformanceEntryType.EVENT) &&
    window.PerformanceEventTiming &&
    'interactionId' in PerformanceEventTiming.prototype
  )
}
