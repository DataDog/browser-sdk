import { type Duration, noop, isExperimentalFeatureEnabled, ExperimentalFeature } from '@datadog/browser-core'
import {
  supportPerformanceTimingEvent,
  type RumEventTiming,
  type RumFirstInputTiming,
} from '../../../browser/performanceCollection'
import { LifeCycleEventType, type LifeCycle } from '../../lifeCycle'
import { ViewLoadingType } from '../../../rawRumEvent.types'
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

  // List of longest interactions on the view by duration.
  const longestInteractions: Array<RumEventTiming | RumFirstInputTiming> = []

  const { getViewInteractionCount } = trackViewInteractionCount(viewLoadingType)
  let maxInpDuration = -1 as Duration

  const { unsubscribe: stop } = lifeCycle.subscribe(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, (entries) => {
    for (const entry of entries) {
      if (entry.entryType === 'event' && entry.interactionId) {
        processEntry(entry)
      }
    }

    const inp = estimateP98LongestInteraction(getViewInteractionCount)
    if (inp && inp.duration > maxInpDuration) {
      maxInpDuration = inp.duration
    }
  })

  /**
   * Process the performance entry:
   * - if its duration is long enough, add the performance entry to the list of worst interactions
   * - if an entry with the same interaction id exists and but its duration is lower than the new one, then replace it in the list of worst interactions
   */
  function processEntry(entry: RumEventTiming | RumFirstInputTiming) {
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
  }

  /**
   * Compute the p98 longest interaction.
   * For better performance the computation is based on 10 longest interactions and the interaction count of the current view.
   */
  function estimateP98LongestInteraction(getViewInteractionCount: () => number) {
    const interactionIndex = Math.min(longestInteractions.length - 1, Math.floor(getViewInteractionCount() / 50))
    return longestInteractions[interactionIndex]
  }

  function sortAndTrimLongestInteractions() {
    longestInteractions.sort((a, b) => b.duration - a.duration).splice(MAX_INTERACTION_ENTRIES)
  }

  return {
    getInteractionToNextPaint: () => {
      // If the interaction count shows there were interactions but
      // none were captured by the PerformanceObserver because of the threshold, report a latency of 0.
      if (maxInpDuration === -1 && getViewInteractionCount()) {
        return 0 as Duration
      } else if (maxInpDuration >= 0) {
        return maxInpDuration
      }
    },
    stop,
  }
}

export function trackViewInteractionCount(viewLoadingType: ViewLoadingType) {
  initInteractionCountPolyfill()
  const previousInteractionCount = viewLoadingType === ViewLoadingType.INITIAL_LOAD ? 0 : getInteractionCount()
  return {
    getViewInteractionCount: () => getInteractionCount()! - previousInteractionCount,
    stop: noop,
  }
}

export function isInteractionToNextPaintSupported() {
  return supportPerformanceTimingEvent('event') && 'interactionId' in PerformanceEventTiming.prototype
}
