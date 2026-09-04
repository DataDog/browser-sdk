import type { Duration, RelativeTime } from '@datadog/js-core/time'
import { addDuration, relativeNow } from '@datadog/js-core/time'
import { mergeInto } from '@datadog/js-core/util'
import { SESSION_TIME_OUT_DELAY } from '@datadog/browser-core'
import type {
  AssembledRumEvent,
  EventBaggage,
  FindEventsQuery,
  IncompleteBaseRumEvent,
  InternalRumEventType,
  RumEventHistoryEntry,
} from './rumInternalApi.types'

// Same constant as LONG_TASK_START_TIME_CORRECTION in actionCollection: long tasks triggered by
// interaction handlers can have a start time slightly before the interaction timestamp (< 1ms).
const LONG_TASK_START_TIME_CORRECTION = 1 as Duration
const END_OF_TIMES = Infinity as RelativeTime

// The child event count fields, as they live directly on the owner event (solely owned and
// computed by the internal API): views count their error / action / long_task / resource /
// frustration children, actions count their error / long_task / resource children.
export interface ViewEventCounts {
  view: {
    error: { count: number }
    action: { count: number }
    long_task: { count: number }
    resource: { count: number }
    frustration: { count: number }
  }
}
export interface ActionEventCounts {
  action: {
    error: { count: number }
    long_task: { count: number }
    resource: { count: number }
  }
}

// Seed the API-owned count fields on a newly started view / action event: every assembled
// version carries the counts (zeros included, as in the current implementation), and consumers
// reading the live event (ex: the click frustration computation) see them increment.
export function seedEventCounts(base: IncompleteBaseRumEvent) {
  if (base.type === 'view') {
    mergeInto(base, {
      view: {
        error: { count: 0 },
        action: { count: 0 },
        long_task: { count: 0 },
        resource: { count: 0 },
        frustration: { count: 0 },
      },
    })
  } else if (base.type === 'action') {
    mergeInto(base, {
      action: { error: { count: 0 }, long_task: { count: 0 }, resource: { count: 0 } },
    })
  }
}

// Internal wrapper of an entry: the time bounds used by findEvents, and the internal event id
// (the linkage id, stamped as view.id / action.id on the event).
export interface InternalHistoryEntry {
  value: RumEventHistoryEntry
  startTime: RelativeTime
  endTime: RelativeTime // END_OF_TIMES while the event is un-ended
  eventId: string
}

// The event history backs findEvents queries and the event hierarchy lookups (finding the view
// or the actions active at a given time). It also owns the per-event state that must live as
// long as its entry: view document versions. Child event counts live directly on the events
// (see seedEventCounts). Ended entries are pruned after the same delay as ValueHistory
// (SESSION_TIME_OUT_DELAY).
//
// The history is the source of truth, notifications are live updates: open events are entries
// with a live `handle` (cleared once the event ends), findable via the `open` query filter, so
// consumers attaching after the events started can catch up without trusting notification
// timing.
export interface EventHistory {
  // The entry references the live event object given in `value` (callers keep mutating it).
  addEntry(value: RumEventHistoryEntry, startTime: RelativeTime, eventId: string): InternalHistoryEntry
  removeEntry(entry: InternalHistoryEntry): void
  // Close the entry's activity window, and clear the live handle (the event is not open
  // anymore: findEvents({ open: true }) stops returning it).
  closeEntry(entry: InternalHistoryEntry, endTime: RelativeTime): void
  // Flip the entry to its complete form with the assembled event. No-op when `final` is false:
  // only the final assembly of an event completes its entry.
  finalizeEntry(entry: InternalHistoryEntry, final: boolean, event: AssembledRumEvent, baggage: EventBaggage): void
  // Set up the per-event state of a newly started view (its document version counter).
  initViewEntry(eventId: string): void
  nextDocumentVersion(eventId: string): number
  // Increment the child event counts on the owner events (the count fields live directly on
  // them, see seedEventCounts). Called from the assembly pipeline, after hooks and before rate
  // limiting / beforeSend, so discarded events are counted too.
  incrementCounts(event: AssembledRumEvent, startTime: RelativeTime): void
  findEvents(query: FindEventsQuery): RumEventHistoryEntry[]
  findViewAt(startTime: RelativeTime): InternalHistoryEntry | undefined
  findActionEntriesAt(startTime: RelativeTime, eventType: InternalRumEventType): InternalHistoryEntry[]
  clear(): void
}

export function createEventHistory(): EventHistory {
  // Entries are stored newest first.
  let historyEntries: InternalHistoryEntry[] = []
  const documentVersions = new Map<string, number>()

  return {
    addEntry(value, startTime, eventId) {
      prune()
      // Hierarchy owners (views / actions) carry their live child counts on the entry, so
      const entry: InternalHistoryEntry = { value, startTime, endTime: END_OF_TIMES, eventId }
      historyEntries.unshift(entry)
      return entry
    },

    removeEntry(entry) {
      historyEntries = historyEntries.filter((candidate) => candidate !== entry)
    },

    closeEntry(entry, endTime) {
      entry.endTime = endTime
      // The event is not open anymore: clear the live handle (see RumEventHistoryEntry).
      if (!entry.value.complete) {
        delete entry.value.handle
      }
    },

    finalizeEntry(entry, final, event, baggage) {
      if (final) {
        entry.value = { complete: true, event, baggage }
      }
    },

    initViewEntry(eventId) {
      documentVersions.set(eventId, 0)
    },

    nextDocumentVersion(eventId) {
      const version = (documentVersions.get(eventId) ?? 0) + 1
      documentVersions.set(eventId, version)
      return version
    },

    incrementCounts(event, startTime) {
      const viewEntry = findViewAt(startTime)
      if (viewEntry) {
        incrementViewCounts((viewEntry.value.event as unknown as ViewEventCounts).view, event)
      }
      if (event.type === 'error' || event.type === 'resource' || event.type === 'long_task') {
        for (const actionEntry of findActionEntriesAt(startTime, event.type)) {
          incrementActionCounts((actionEntry.value.event as unknown as ActionEventCounts).action, event)
        }
      }
    },

    findEvents,

    findViewAt,

    findActionEntriesAt,

    clear() {
      historyEntries = []
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
          if (query.open && (entry.value.complete || entry.value.handle === undefined)) {
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
    // previous one ends, and events at that instant belong to the new view. With overlapping
    // views (not a usage of today's consumers), the most recently started one wins.
    return historyEntries.find(
      (entry) => entry.value.event.type === 'view' && entry.startTime <= startTime && startTime < entry.endTime
    )
  }

  function findActionEntriesAt(startTime: RelativeTime, eventType: InternalRumEventType): InternalHistoryEntry[] {
    // Long tasks triggered by interaction handlers can have a start time slightly before the
    // interaction timestamp (< 1ms), so compensate the lookup time.
    const lookupTime = eventType === 'long_task' ? addDuration(startTime, LONG_TASK_START_TIME_CORRECTION) : startTime
    return historyEntries
      .filter(
        (entry) => entry.value.event.type === 'action' && entry.startTime <= lookupTime && lookupTime < entry.endTime
      )
      .reverse() // chronological order, oldest action first
  }

  function prune() {
    const oldTimeThreshold = relativeNow() - SESSION_TIME_OUT_DELAY
    historyEntries = historyEntries.filter((entry) => {
      if (entry.endTime !== END_OF_TIMES && entry.endTime < oldTimeThreshold) {
        documentVersions.delete(entry.eventId)
        return false
      }
      return true
    })
  }
}

// The count fields are seeded at start (seedEventCounts), so the increments below can assume
// them present on the owner event.
function incrementViewCounts(viewCounts: ViewEventCounts['view'], event: AssembledRumEvent) {
  switch (event.type) {
    case 'error':
      viewCounts.error.count += 1
      break
    case 'action': {
      viewCounts.action.count += 1
      const frustrationTypes = (event.action as { frustration?: { type?: string[] } }).frustration?.type
      viewCounts.frustration.count += frustrationTypes?.length ?? 0
      break
    }
    case 'long_task':
      viewCounts.long_task.count += 1
      break
    case 'resource':
      // Discarded resources (ex: tracing context discarded by sampling) are not counted, as in
      // the current implementation
      if (!(event as { _dd?: { discarded?: boolean } })._dd?.discarded) {
        viewCounts.resource.count += 1
      }
      break
  }
}

function incrementActionCounts(actionCounts: ActionEventCounts['action'], event: AssembledRumEvent) {
  switch (event.type) {
    case 'error':
      actionCounts.error.count += 1
      break
    case 'long_task':
      actionCounts.long_task.count += 1
      break
    case 'resource':
      if (!(event as { _dd?: { discarded?: boolean } })._dd?.discarded) {
        actionCounts.resource.count += 1
      }
      break
  }
}
