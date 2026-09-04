import type { Duration, RelativeTime } from '@datadog/js-core/time'
import { addDuration, relativeNow } from '@datadog/js-core/time'
import { SESSION_TIME_OUT_DELAY } from '@datadog/browser-core'
import type {
  AssembledRumEvent,
  EventBaggage,
  EventCounts,
  FindEventsQuery,
  InternalRumEventType,
  RumEventHistoryEntry,
} from './rumInternalApi.types'

// Same constant as LONG_TASK_START_TIME_CORRECTION in actionCollection: long tasks triggered by
// interaction handlers can have a start time slightly before the interaction timestamp (< 1ms).
const LONG_TASK_START_TIME_CORRECTION = 1 as Duration
const END_OF_TIMES = Infinity as RelativeTime

export type ActionChildCounts = EventCounts

// Internal wrapper of an entry: the time bounds used by findEvents, and the internal event id
// (the linkage id, stamped as view.id / action.id on the event).
export interface InternalHistoryEntry {
  value: RumEventHistoryEntry
  startTime: RelativeTime
  endTime: RelativeTime // END_OF_TIMES while the event is un-ended
  eventId: string
}

// The event history backs findEvents queries and the event hierarchy lookups (finding the view
// or the actions active at a given time). It also owns the per-event state that must live as long
// as its entry: view / action child event counts, and view document versions. Ended entries are
// pruned after the same delay as ValueHistory (SESSION_TIME_OUT_DELAY).
//
// Views started through startEvent are active right away, but the draft view (see
// rumInternalApi.ts) enters the history at creation and only becomes active — findViewAt and
// hierarchy-wise — once promoted. Un-started views are still visible in findEvents (by design:
// history entries exist from the moment the event enters the history), they just don't cover
// time and don't assemble.
export interface EventHistory {
  // The entry references the live event object given in `value` (callers keep mutating it).
  addEntry(value: RumEventHistoryEntry, startTime: RelativeTime, eventId: string): InternalHistoryEntry
  removeEntry(entry: InternalHistoryEntry): void
  closeEntry(entry: InternalHistoryEntry, endTime: RelativeTime): void
  // Mark a view entry as started (active): the draft does it at promotion, real views at
  // creation (they never enter the un-started set). Un-started view entries don't cover time
  // (findViewAt skips them).
  markViewUnstarted(eventId: string): void
  markViewStarted(eventId: string): void
  isViewStarted(eventId: string): boolean
  // Flip the entry to its complete form with the assembled event. No-op when `final` is false:
  // only the final assembly of an event completes its entry.
  finalizeEntry(entry: InternalHistoryEntry, final: boolean, event: AssembledRumEvent, baggage: EventBaggage): void
  // Set up the per-event state of a newly started view / action (counts, document version), and
  // return the live counts object — history entries reference it, so consumers reading counts
  // off entries always see the current values.
  initViewEntry(eventId: string): EventCounts
  initActionEntry(eventId: string): ActionChildCounts
  deleteActionEntry(eventId: string): void
  nextDocumentVersion(eventId: string): number
  getEventCounts(eventId: string): EventCounts
  getActionChildCounts(eventId: string): ActionChildCounts
  // Increment the view / action counts an event belongs to. Called from the assembly pipeline,
  // after hooks and before rate limiting / beforeSend, so discarded events are counted too.
  incrementCounts(event: AssembledRumEvent, startTime: RelativeTime): void
  findEvents(query: FindEventsQuery): RumEventHistoryEntry[]
  findViewAt(startTime: RelativeTime): InternalHistoryEntry | undefined
  findActionIdsAt(startTime: RelativeTime, eventType: InternalRumEventType): string[]
  clear(): void
}

export function createEventHistory(): EventHistory {
  // Entries are stored newest first.
  let historyEntries: InternalHistoryEntry[] = []
  const viewCounts = new Map<string, EventCounts>()
  const actionCounts = new Map<string, ActionChildCounts>()
  const documentVersions = new Map<string, number>()
  // The un-started view ids (the draft, before promotion). findViewAt skips them; findEvents
  // doesn't (they are visible by design).
  const unstartedViewIds = new Set<string>()

  return {
    addEntry(value, startTime, eventId) {
      prune()
      // Hierarchy owners (views / actions) carry their live child counts on the entry, so
      // findEvents consumers can read them (see EventCounts). The count object is the one the
      // maps hold: incrementCounts mutations are reflected on the entry.
      if (value.event.type === 'view') {
        value.counts = viewCounts.get(eventId)
      } else if (value.event.type === 'action') {
        value.counts = actionCounts.get(eventId)
      }
      const entry: InternalHistoryEntry = { value, startTime, endTime: END_OF_TIMES, eventId }
      historyEntries.unshift(entry)
      return entry
    },

    removeEntry(entry) {
      historyEntries = historyEntries.filter((candidate) => candidate !== entry)
    },

    closeEntry(entry, endTime) {
      entry.endTime = endTime
    },

    markViewUnstarted(eventId) {
      unstartedViewIds.add(eventId)
    },

    markViewStarted(eventId) {
      unstartedViewIds.delete(eventId)
    },

    isViewStarted(eventId) {
      return !unstartedViewIds.has(eventId)
    },

    finalizeEntry(entry, final, event, baggage) {
      if (final) {
        entry.value = { complete: true, event, baggage, counts: entry.value.counts }
      }
    },

    initViewEntry(eventId) {
      const counts = createEventCounts()
      viewCounts.set(eventId, counts)
      documentVersions.set(eventId, 0)
      return counts
    },

    initActionEntry(eventId) {
      const counts: EventCounts = createEventCounts()
      actionCounts.set(eventId, counts)
      return counts
    },

    deleteActionEntry(eventId) {
      actionCounts.delete(eventId)
    },

    nextDocumentVersion(eventId) {
      const version = (documentVersions.get(eventId) ?? 0) + 1
      documentVersions.set(eventId, version)
      return version
    },

    getEventCounts(eventId) {
      return viewCounts.get(eventId) ?? createEventCounts()
    },

    getActionChildCounts(eventId) {
      return actionCounts.get(eventId) ?? createEventCounts()
    },

    incrementCounts(event, startTime) {
      const viewEntry = findViewAt(startTime)
      if (viewEntry) {
        const counts = viewCounts.get(viewEntry.eventId)
        if (counts) {
          incrementViewCounts(counts, event)
        }
      }
      if (event.type === 'error' || event.type === 'resource' || event.type === 'long_task') {
        for (const actionId of findActionIdsAt(startTime, event.type)) {
          const counts = actionCounts.get(actionId)
          if (counts) {
            incrementActionCounts(counts, event)
          }
        }
      }
    },

    findEvents,

    findViewAt,

    findActionIdsAt,

    clear() {
      historyEntries = []
      viewCounts.clear()
      actionCounts.clear()
      documentVersions.clear()
    },
  }

  function findEvents(query: FindEventsQuery): RumEventHistoryEntry[] {
    prune()
    return (
      historyEntries
        .filter((entry) => {
          if (query.type !== undefined && entry.value.event.type !== query.type) {
            return false
          }
          if (query.startedAfter !== undefined && entry.startTime < query.startedAfter) {
            return false
          }
          if (query.startedBefore !== undefined && entry.startTime > query.startedBefore) {
            return false
          }
          const isUnended = entry.endTime === END_OF_TIMES
          if (query.endedAfter !== undefined) {
            // Un-ended events match `endedAfter` for any time
            if (!isUnended && entry.endTime < query.endedAfter) {
              return false
            }
          }
          if (query.endedBefore !== undefined && (isUnended || entry.endTime > query.endedBefore)) {
            return false
          }
          return true
        })
        // Chronological order, most recent last
        .map((entry) => entry.value)
        .reverse()
    )
  }

  function findViewAt(startTime: RelativeTime): InternalHistoryEntry | undefined {
    // The end bound is exclusive: a view ended at t is not active at t (as ValueHistory's
    // closeActive in the current implementation), so a new view can start exactly when the
    // previous one ends, and events at that instant belong to the new view.
    // Un-started views (the draft, before promotion) don't cover time: child events collected
    // before promotion are held by the orchestrator, and only assemble once the promoted view
    // covers them (it starts at the clock origin, so it covers them).
    return historyEntries.find(
      (entry) =>
        entry.value.event.type === 'view' &&
        !unstartedViewIds.has(entry.eventId) &&
        entry.startTime <= startTime &&
        startTime < entry.endTime
    )
  }

  function findActionIdsAt(startTime: RelativeTime, eventType: InternalRumEventType): string[] {
    // Long tasks triggered by interaction handlers can have a start time slightly before the
    // interaction timestamp (< 1ms), so compensate the lookup time.
    const lookupTime = eventType === 'long_task' ? addDuration(startTime, LONG_TASK_START_TIME_CORRECTION) : startTime
    return historyEntries
      .filter(
        (entry) => entry.value.event.type === 'action' && entry.startTime <= lookupTime && lookupTime < entry.endTime
      )
      .map((entry) => entry.eventId)
      .reverse() // chronological order, oldest action first
  }

  function prune() {
    const oldTimeThreshold = relativeNow() - SESSION_TIME_OUT_DELAY
    historyEntries = historyEntries.filter((entry) => {
      if (entry.endTime !== END_OF_TIMES && entry.endTime < oldTimeThreshold) {
        viewCounts.delete(entry.eventId)
        documentVersions.delete(entry.eventId)
        unstartedViewIds.delete(entry.eventId)
        return false
      }
      return true
    })
  }
}

function createEventCounts(): EventCounts {
  return { errorCount: 0, actionCount: 0, longTaskCount: 0, resourceCount: 0, frustrationCount: 0 }
}

function incrementViewCounts(counts: EventCounts, event: AssembledRumEvent) {
  const { errorCount, actionCount, longTaskCount, resourceCount, frustrationCount } = counts
  switch (event.type) {
    case 'error':
      counts.errorCount = errorCount + 1
      break
    case 'action': {
      counts.actionCount = actionCount + 1
      const frustrationTypes = (event.action as { frustration?: { type?: string[] } }).frustration?.type
      counts.frustrationCount = frustrationCount + (frustrationTypes?.length ?? 0)
      break
    }
    case 'long_task':
      counts.longTaskCount = longTaskCount + 1
      break
    case 'resource':
      // Discarded resources (ex: tracing context discarded by sampling) are not counted, as in
      // the current implementation
      if (!(event as { _dd?: { discarded?: boolean } })._dd?.discarded) {
        counts.resourceCount = resourceCount + 1
      }
      break
  }
}

function incrementActionCounts(counts: ActionChildCounts, event: AssembledRumEvent) {
  const { errorCount, longTaskCount, resourceCount } = counts
  switch (event.type) {
    case 'error':
      counts.errorCount = errorCount + 1
      break
    case 'long_task':
      counts.longTaskCount = longTaskCount + 1
      break
    case 'resource':
      if (!(event as { _dd?: { discarded?: boolean } })._dd?.discarded) {
        counts.resourceCount = resourceCount + 1
      }
      break
  }
}
