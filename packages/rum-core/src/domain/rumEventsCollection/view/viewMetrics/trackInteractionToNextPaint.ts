import { noop, isExperimentalFeatureEnabled, ExperimentalFeature } from '@datadog/browser-core'
import type { Duration } from '@datadog/browser-core'
import { supportPerformanceTimingEvent } from '../../../../browser/performanceCollection'
import type { RumFirstInputTiming, RumPerformanceEventTiming } from '../../../../browser/performanceCollection'
import { LifeCycleEventType, type LifeCycle } from '../../../lifeCycle'
import { ViewLoadingType } from '../../../../rawRumEvent.types'
import { getInteractionCount, initInteractionCountPolyfill } from './interactionCountPolyfill'

// Arbitrary value to prevent unnecessary memory usage on views with lots of interactions.
const MAX_INTERACTION_ENTRIES = 10

/**
 * Track the interaction to next paint (INP).
 * To avoid outliers, return the p98 worst interaction of the view.
 * Documentation: https://web.dev/inp/
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/main/src/onINP.ts
 */
export function trackInteractionToNextPaint(viewLoadingType: ViewLoadingType, lifeCycle: LifeCycle) {
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
  let inpDuration = -1 as Duration

  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    for (const entry of entries) {
      if ((entry.entryType === 'event' || entry.entryType === 'first-input') && entry.interactionId) {
        longestInteractions.process(entry)
      }
    }

    const newInpDuration = longestInteractions.estimateP98Duration()
    if (newInpDuration) {
      inpDuration = newInpDuration
    }
  })

  return {
    getInteractionToNextPaint: () => {
      // If no INP duration where captured because of the performanceObserver 40ms threshold
      // but the view interaction count > 0 then report 0
      if (inpDuration >= 0) {
        return inpDuration
      } else if (getViewInteractionCount()) {
        return 0 as Duration
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
    estimateP98Duration(): Duration | undefined {
      const interactionIndex = Math.min(longestInteractions.length - 1, Math.floor(getViewInteractionCount() / 50))
      return longestInteractions[interactionIndex]?.duration
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
  return supportPerformanceTimingEvent('event') && 'interactionId' in PerformanceEventTiming.prototype
}
