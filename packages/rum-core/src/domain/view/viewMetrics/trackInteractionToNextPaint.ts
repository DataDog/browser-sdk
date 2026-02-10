import { elapsed, noop, ONE_MINUTE, ExperimentalFeature, isExperimentalFeatureEnabled } from '@datadog/browser-core'
import type { Duration, RelativeTime } from '@datadog/browser-core'
import {
  createPerformanceObservable,
  RumPerformanceEntryType,
  supportPerformanceTimingEvent,
} from '../../../browser/performanceObservable'
import type { RumFirstInputTiming, RumPerformanceEventTiming } from '../../../browser/performanceObservable'
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
  // Reference time use for grouping, set once for each group
  referenceRenderTime: RelativeTime
  entries: Array<RumPerformanceEventTiming | RumFirstInputTiming>
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

  const { getViewInteractionCount, stopViewInteractionCount } = trackViewInteractionCount(viewLoadingType)

  let viewEnd = Infinity as RelativeTime

  const longestInteractions = trackLongestInteractions(getViewInteractionCount)
  let interactionToNextPaint = -1 as Duration
  let interactionToNextPaintTargetSelector: string | undefined
  let interactionToNextPaintStartTime: Duration | undefined
  let interactionToNextPaintSubParts: InteractionToNextPaint['subParts'] | undefined

  // Entry grouping for subparts calculation
  const groupsByInteractionId = new Map<number, EntriesGroup>()

  function updateGroupWithEntry(group: EntriesGroup, entry: RumPerformanceEventTiming | RumFirstInputTiming) {
    group.startTime = Math.min(entry.startTime, group.startTime) as RelativeTime

    // For each group, we keep the biggest interval possible between processingStart and processingEnd
    group.processingStart = Math.min(entry.processingStart, group.processingStart) as RelativeTime
    group.processingEnd = Math.max(entry.processingEnd, group.processingEnd) as RelativeTime
    group.entries.push(entry)
  }

  function groupEntriesByRenderTime(entry: RumPerformanceEventTiming | RumFirstInputTiming) {
    if (!entry.interactionId || !entry.processingStart || !entry.processingEnd) {
      return
    }

    const renderTime = (entry.startTime + entry.duration) as RelativeTime

    // Check if this interactionId already has a group
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
      entries: [entry],
    })
  }

  function computeInpSubParts(
    entry: RumPerformanceEventTiming | RumFirstInputTiming,
    inpDuration: Duration
  ): InteractionToNextPaint['subParts'] | undefined {
    if (!entry.processingStart || !entry.processingEnd) {
      return undefined
    }

    // Get group timing by interactionId (or use individual entry if no group)
    const group = entry.interactionId ? groupsByInteractionId.get(entry.interactionId) : undefined

    const { startTime, processingStart, processingEnd: processingEndRaw } = group || entry

    // Prevents reported value to happen before processingStart.
    // We group values around startTime +/- RENDER_TIME_GROUPING_THRESHOLD duration so some entries can be before processingStart.
    const nextPaintTime = Math.max((entry.startTime + inpDuration) as RelativeTime, processingStart) as RelativeTime

    // Clamp processingEnd to not exceed nextPaintTime
    const processingEnd = Math.min(processingEndRaw, nextPaintTime) as RelativeTime

    return {
      inputDelay: elapsed(startTime, processingStart),
      processingDuration: elapsed(processingStart, processingEnd),
      presentationDelay: elapsed(processingEnd, nextPaintTime),
    }
  }

  function handleEntries(entries: Array<RumPerformanceEventTiming | RumFirstInputTiming>) {
    for (const entry of entries) {
      if (
        entry.interactionId &&
        // Check the entry start time is inside the view bounds because some view interactions can be reported after the view end (if long duration).
        entry.startTime >= viewStart &&
        entry.startTime <= viewEnd
      ) {
        longestInteractions.process(entry)
        groupEntriesByRenderTime(entry)
      }
    }

    const newInteraction = longestInteractions.estimateP98Interaction()

    if (newInteraction) {
      if (newInteraction.duration !== interactionToNextPaint) {
        interactionToNextPaint = newInteraction.duration
        interactionToNextPaintStartTime = elapsed(viewStart, newInteraction.startTime)
        interactionToNextPaintTargetSelector = getInteractionSelector(newInteraction.startTime)

        if (!interactionToNextPaintTargetSelector && newInteraction.target && isElementNode(newInteraction.target)) {
          interactionToNextPaintTargetSelector = getSelectorFromElement(
            newInteraction.target,
            configuration.actionNameAttribute
          )
        }
      }

      if (isExperimentalFeatureEnabled(ExperimentalFeature.INP_SUBPARTS)) {
        interactionToNextPaintSubParts = computeInpSubParts(newInteraction, interactionToNextPaint)
      }
    }
  }

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

  return {
    getInteractionToNextPaint: (): InteractionToNextPaint | undefined => {
      // If no INP duration where captured because of the performanceObserver 40ms threshold
      // but the view interaction count > 0 then report 0
      if (interactionToNextPaint >= 0) {
        return {
          value: Math.min(interactionToNextPaint, MAX_INP_VALUE) as Duration,
          targetSelector: interactionToNextPaintTargetSelector,
          time: interactionToNextPaintStartTime,
          subParts: interactionToNextPaintSubParts,
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
      groupsByInteractionId.clear()
    },
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

export function isInteractionToNextPaintSupported() {
  return (
    supportPerformanceTimingEvent(RumPerformanceEntryType.EVENT) &&
    window.PerformanceEventTiming &&
    'interactionId' in PerformanceEventTiming.prototype
  )
}
