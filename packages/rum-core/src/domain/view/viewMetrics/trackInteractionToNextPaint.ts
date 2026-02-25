import type { Duration, RelativeTime } from '@datadog/browser-core'
import { elapsed, ExperimentalFeature, isExperimentalFeatureEnabled, noop, ONE_MINUTE } from '@datadog/browser-core'
import type { RumFirstInputTiming, RumPerformanceEventTiming } from '../../../browser/performanceObservable'
import {
  createPerformanceObservable,
  RumPerformanceEntryType,
  supportPerformanceTimingEvent,
} from '../../../browser/performanceObservable'
import { ViewLoadingType } from '../../../rawRumEvent.types'
import { getSelectorFromElement } from '../../getSelectorFromElement'
import { isElementNode } from '../../../browser/htmlDomUtils'
import { getInteractionSelector } from '../../action/interactionSelectorCache'
import type { RumConfiguration } from '../../configuration'
import { getInteractionCount, initInteractionCountPolyfill } from './interactionCountPolyfill'

// Arbitrary value to prevent unnecessary memory usage on views with lots of interactions.
const MAX_INTERACTION_ENTRIES = 10
// Arbitrary value to cap INP outliers
export const MAX_INP_VALUE = (1 * ONE_MINUTE) as Duration

// Event Timing API rounds duration values to the nearest 8 ms
const RENDER_TIME_GROUPING_THRESHOLD = 8 as Duration

export interface InteractionToNextPaint {
  value: Duration
  targetSelector?: string
  time?: Duration
  subParts?: {
    inputDelay: Duration
    processingDuration: Duration
    presentationDelay: Duration
  }
}
interface EntriesGroup {
  startTime: RelativeTime
  processingStart: RelativeTime
  processingEnd: RelativeTime
  // Reference time used for grouping, set once at group creation — anchors the 8ms merge window
  referenceRenderTime: RelativeTime
}

/**
 * Track the interaction to next paint (INP).
 * To avoid outliers, return the p98 worst interaction of the view.
 * Documentation: https://web.dev/inp/
 * Reference implementation: https://github.com/GoogleChrome/web-vitals/blob/main/src/onINP.ts
 */
export function trackInteractionToNextPaint(
  configuration: RumConfiguration,
  viewStart: RelativeTime,
  viewLoadingType: ViewLoadingType
) {
  if (!isInteractionToNextPaintSupported()) {
    return {
      getInteractionToNextPaint: () => undefined,
      setViewEnd: noop,
      stop: noop,
    }
  }

  let viewEnd = Infinity as RelativeTime
  let currentInp:
    | {
        duration: Duration
        startTime: Duration
        targetSelector?: string
        subParts?: InteractionToNextPaint['subParts']
      }
    | undefined

  const { getViewInteractionCount, stopViewInteractionCount } = trackViewInteractionCount(viewLoadingType)
  const longestInteractions = trackLongestInteractions(getViewInteractionCount)
  const subPartsTracker = isExperimentalFeatureEnabled(ExperimentalFeature.INP_SUBPARTS)
    ? createSubPartsTracker(longestInteractions)
    : null
  const firstInputSubscription = createPerformanceObservable(configuration, {
    type: RumPerformanceEntryType.FIRST_INPUT,
    buffered: true,
  }).subscribe(handleEntries)
  const eventSubscription = createPerformanceObservable(configuration, {
    type: RumPerformanceEntryType.EVENT,
    // durationThreshold only impact PerformanceEventTiming entries used for INP computation which requires a threshold at 40 (default is 104ms)
    // cf: https://github.com/GoogleChrome/web-vitals/blob/3806160ffbc93c3c4abf210a167b81228172b31c/src/onINP.ts#L202-L210
    durationThreshold: 40,
    buffered: true,
  }).subscribe(handleEntries)

  function handleEntries(entries: Array<RumPerformanceEventTiming | RumFirstInputTiming>) {
    for (const entry of entries) {
      if (
        entry.interactionId &&
        // Check the entry start time is inside the view bounds because some view interactions can be reported after the view end (if long duration).
        entry.startTime >= viewStart &&
        entry.startTime <= viewEnd
      ) {
        longestInteractions.process(entry)
        subPartsTracker?.process(entry)
      }
    }
    subPartsTracker?.pruneUntracked()
    const candidate = longestInteractions.estimateP98Interaction()
    if (candidate) {
      updateCurrentInp(candidate)
    }
  }

  function updateCurrentInp(candidate: RumPerformanceEventTiming | RumFirstInputTiming) {
    const newStartTime = elapsed(viewStart, candidate.startTime)
    // startTime catches identity changes when the p98 switches to a different interaction with the same duration,
    // ensuring targetSelector and subParts always describe the same interaction.
    if (!currentInp || candidate.duration !== currentInp.duration || newStartTime !== currentInp.startTime) {
      let targetSelector = getInteractionSelector(candidate.startTime)
      if (!targetSelector && candidate.target && isElementNode(candidate.target)) {
        targetSelector = getSelectorFromElement(candidate.target, configuration.actionNameAttribute)
      }
      currentInp = {
        duration: candidate.duration,
        startTime: newStartTime,
        targetSelector,
      }
    }
    // Recomputed on every batch: the group for the p98 interaction may have been updated
    // with new min/max timing even when the p98 identity (duration, startTime) is unchanged.
    if (subPartsTracker) {
      currentInp.subParts = subPartsTracker.computeSubParts(candidate, sanitizeInpValue(currentInp.duration))
    }
  }

  return {
    getInteractionToNextPaint: (): InteractionToNextPaint | undefined => {
      // If no INP duration where captured because of the performanceObserver 40ms threshold
      // but the view interaction count > 0 then report 0
      if (currentInp) {
        return {
          value: sanitizeInpValue(currentInp.duration),
          targetSelector: currentInp.targetSelector,
          time: currentInp.startTime,
          subParts: currentInp.subParts,
        }
      } else if (getViewInteractionCount()) {
        return {
          value: 0 as Duration,
        }
      }
    },
    setViewEnd: (viewEndTime: RelativeTime) => {
      viewEnd = viewEndTime
      stopViewInteractionCount()
    },
    stop: () => {
      eventSubscription.unsubscribe()
      firstInputSubscription.unsubscribe()
      subPartsTracker?.stop()
    },
  }
}

/**
 * Maintains a bounded list of the slowest interactions seen so far, used to estimate the p98
 * interaction duration without keeping every entry in memory.
 */
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

    isTracked(interactionId: number): boolean {
      return longestInteractions.some((i) => i.interactionId === interactionId)
    },
  }
}

/**
 * Tracks the number of interactions that occurred during the current view. Freezes the count
 * when the view ends so that the p98 estimate remains stable after `setViewEnd` is called.
 */
export function trackViewInteractionCount(viewLoadingType: ViewLoadingType) {
  initInteractionCountPolyfill()
  const previousInteractionCount = viewLoadingType === ViewLoadingType.INITIAL_LOAD ? 0 : getInteractionCount()
  let state: { stopped: false } | { stopped: true; interactionCount: number } = { stopped: false }

  function computeViewInteractionCount() {
    return getInteractionCount() - previousInteractionCount
  }

  return {
    getViewInteractionCount: () => {
      if (state.stopped) {
        return state.interactionCount
      }

      return computeViewInteractionCount()
    },
    stopViewInteractionCount: () => {
      state = { stopped: true, interactionCount: computeViewInteractionCount() }
    },
  }
}

/**
 * Groups performance entries by interaction and render time to compute INP subparts
 * (input delay, processing duration, presentation delay). Entries sharing the same
 * interactionId, or whose render time falls within the 8 ms Event Timing rounding window,
 * are merged into a single group so that subparts always sum to the reported INP duration.
 */
function createSubPartsTracker(longestInteractions: ReturnType<typeof trackLongestInteractions>) {
  const groupsByInteractionId = new Map<number, EntriesGroup>()

  function updateGroupWithEntry(group: EntriesGroup, entry: RumPerformanceEventTiming | RumFirstInputTiming) {
    group.startTime = Math.min(entry.startTime, group.startTime) as RelativeTime
    // For each group, we keep the biggest interval possible between processingStart and processingEnd
    group.processingStart = Math.min(entry.processingStart, group.processingStart) as RelativeTime
    group.processingEnd = Math.max(entry.processingEnd, group.processingEnd) as RelativeTime
  }

  return {
    process(entry: RumPerformanceEventTiming | RumFirstInputTiming): void {
      if (entry.interactionId === undefined || !entry.processingStart || !entry.processingEnd) {
        return
      }

      const renderTime = (entry.startTime + entry.duration) as RelativeTime
      const existingGroup = groupsByInteractionId.get(entry.interactionId)

      if (existingGroup) {
        // Update existing group with MIN/MAX values (keep original referenceRenderTime)
        updateGroupWithEntry(existingGroup, entry)
        return
      }

      // Try to find a group within 8ms window to merge with (different interactionId, same frame)
      for (const [, group] of groupsByInteractionId.entries()) {
        if (Math.abs(renderTime - group.referenceRenderTime) <= RENDER_TIME_GROUPING_THRESHOLD) {
          updateGroupWithEntry(group, entry)
          // Also store under this entry's interactionId for easy lookup
          groupsByInteractionId.set(entry.interactionId, group)
          return
        }
      }

      // Create new group
      groupsByInteractionId.set(entry.interactionId, {
        startTime: entry.startTime,
        processingStart: entry.processingStart,
        processingEnd: entry.processingEnd,
        referenceRenderTime: renderTime,
      })
    },

    // Prune after all entries are grouped: groups not in longestInteractions can never affect p98 subparts.
    // Keeps groupsByInteractionId capped at MAX_INTERACTION_ENTRIES
    pruneUntracked(): void {
      for (const [interactionId] of groupsByInteractionId) {
        if (!longestInteractions.isTracked(interactionId)) {
          groupsByInteractionId.delete(interactionId)
        }
      }
    },

    computeSubParts(
      entry: RumPerformanceEventTiming | RumFirstInputTiming,
      inpDuration: Duration
    ): InteractionToNextPaint['subParts'] | undefined {
      if (!entry.processingStart || !entry.processingEnd || entry.interactionId === undefined) {
        return undefined
      }

      const group = groupsByInteractionId.get(entry.interactionId)
      // Shouldn't happen since entries are grouped before p98 calculation.
      if (!group) {
        return undefined
      }

      // Use group.startTime consistently to ensure subparts sum to inpDuration
      // Math.max prevents nextPaintTime from being before processingStart (Chrome implementation)
      const nextPaintTime = Math.max(
        (group.startTime + inpDuration) as RelativeTime,
        group.processingStart
      ) as RelativeTime

      // Clamp processingEnd to not exceed nextPaintTime
      const processingEnd = Math.min(group.processingEnd, nextPaintTime) as RelativeTime

      return {
        inputDelay: elapsed(group.startTime, group.processingStart),
        processingDuration: elapsed(group.processingStart, processingEnd),
        presentationDelay: elapsed(processingEnd, nextPaintTime),
      }
    },

    stop(): void {
      groupsByInteractionId.clear()
    },
  }
}

export function isInteractionToNextPaintSupported() {
  return (
    supportPerformanceTimingEvent(RumPerformanceEntryType.EVENT) &&
    window.PerformanceEventTiming &&
    'interactionId' in PerformanceEventTiming.prototype
  )
}

function sanitizeInpValue(inpValue: Duration) {
  return Math.min(inpValue, MAX_INP_VALUE) as Duration
}
