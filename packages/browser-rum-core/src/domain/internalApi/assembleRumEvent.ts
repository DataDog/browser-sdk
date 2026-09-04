import { DISCARDED } from '@datadog/js-core/assembly'
import type { Hook } from '@datadog/js-core/assembly'
import { combine, deepClone, mergeInto } from '@datadog/js-core/util'
import type { Context, EventRateLimiter, Observable } from '@datadog/browser-core'
import type { DraftEvent } from './baseRumEvent'
import type { EventHistory, InternalHistoryEntry } from './eventHistory'
import type {
  AssembledRumEvent,
  AssembleHookParams,
  BeforeSend,
  EventBaggage,
  InternalRumEventType,
  RumInternalNotification,
} from './rumInternalApi.types'

// A pending assembly: the unit of work the pipeline consumes. `baseRumEvent` is the event being
// built (possibly a clone taken when the assembly was buffered), `final` tells whether this is
// the final assembly of the event (stop() for started events, one-shot addEvent).
export interface PendingAssembly {
  baseRumEvent: DraftEvent
  historyEntry: InternalHistoryEntry
  eventId: string
  final: boolean
  baggage: EventBaggage
}

// The state the assembly pipeline runs against, created once per internal API instance.
export interface AssemblyPipeline {
  history: EventHistory
  assembleHook: Hook<AssembleHookParams, Context>
  rateLimiters: Partial<Record<InternalRumEventType, EventRateLimiter>>
  beforeSend: BeforeSend | undefined
  notifications: Observable<RumInternalNotification>
}

// Assemble an event and notify `event_collected` when it makes it through, in order:
// base event → hierarchy (view / action linkage, event counts, document version) → hooks →
// history finalization → event counts → rate limiting → beforeSend → notification.
//
// Events dropped along the way (no covering view, hook DISCARDED, rate limited, dismissed by
// beforeSend) don't notify. Rate-limited and beforeSend-dismissed events are still counted and
// finalized in the history, since counts are computed before rate limiting.
export function assembleRumEvent(pipeline: AssemblyPipeline, pending: PendingAssembly) {
  const { history } = pipeline
  const { baseRumEvent, historyEntry, eventId, final, baggage } = pending
  const startTime = baggage.startClocks.relative
  const event = deepClone(baseRumEvent) as AssembledRumEvent
  if (event.date === undefined) {
    event.date = baggage.startClocks.timeStamp
  }

  if (event.type === 'view') {
    // view.id is stamped at start; view.name / view.url / service / version AND the child event
    // counts flow from the start options through the base event (counts are API-owned fields
    // seeded at start and incremented in place). Only the document version is merged here.
    mergeInto(event, {
      _dd: { document_version: history.nextDocumentVersion(eventId) },
      view: { id: eventId },
    })
  } else {
    const viewEntry = history.findViewAt(startTime)
    if (!viewEntry) {
      // Only reachable through a direct misuse of this function (the orchestrator buffers
      // assemblies until a view covers the event): drop the event, as the current implementation
      // does when no view covers it (sessionContext returns DISCARDED). The entry is still
      // finalized, so findEvents never leaves events in a limbo state.
      history.finalizeEntry(historyEntry, final, event, baggage)
      return
    }
    // Cast: the view linkage fields, whatever the entry completeness
    const viewEvent = viewEntry.value.event as unknown as {
      view: { id: string; name?: string; url: string }
      service?: string
      version?: string
    }
    mergeInto(event, {
      service: viewEvent.service,
      version: viewEvent.version,
      view: { id: viewEvent.view.id, name: viewEvent.view.name, url: viewEvent.view.url },
    })

    if (event.type === 'action') {
      // The child event counts flow from the base event (API-owned fields seeded at start);
      // only the id is merged here.
      mergeInto(event, { action: { id: eventId } })
    } else {
      const actionIds = history.findActionEntriesAt(startTime, event.type).map((entry) => entry.eventId)
      if (actionIds.length > 0) {
        mergeInto(event, { action: { id: actionIds } })
      }
    }
  }

  // Hooks contribute default attributes. The event fields (base + hierarchy) win over the hook
  // attributes, as in the current implementation.
  const hookAttributes = pipeline.assembleHook.trigger({
    eventType: event.type,
    event,
    startTime,
    baggage,
  })
  if (hookAttributes === DISCARDED) {
    history.finalizeEntry(historyEntry, final, event, baggage)
    return
  }
  // createHook.trigger never returns SKIPPED: SKIPPED is consumed per-callback inside trigger
  const assembled = hookAttributes !== undefined ? combine(hookAttributes, event) : event

  // Flip the entry to its complete form with the assembled event, before rate limiting and
  // beforeSend: discarded events are part of the history by design, so they must not be left in
  // a limbo incomplete state.
  history.finalizeEntry(historyEntry, final, assembled, baggage)

  // The event lifecycle notifications (`event_updated` on intermediate assemblies, `event_stopped`
  // on final ones) fire as soon as the event is assembled, regardless of rate limiting and
  // beforeSend: the event reached its final state even if it is dropped before being sent (ex:
  // "on view end" work subscribes to `event_stopped` for views).
  pipeline.notifications.notify(
    final ? { type: 'event_stopped', event: assembled, baggage } : { type: 'event_updated', event: assembled, baggage }
  )

  // Event counts are incremented after hooks (so hooks can set `_dd.discarded` on resources,
  // or add action frustration types) and before rate limiting and beforeSend (so counts include
  // discarded events, as decided in the plan). The count fields live on the owner events
  // (seeded at start), so the increments land on their live base and ride the next versions.
  history.incrementCounts(assembled, startTime)

  // Views are exempt from rate limiting, as in the current implementation
  const rateLimiter = pipeline.rateLimiters[assembled.type]
  if (assembled.type !== 'view' && rateLimiter?.isLimitReached()) {
    return
  }

  // Views can't be dismissed by beforeSend, as in the current implementation
  if (
    pipeline.beforeSend &&
    assembled.type !== 'view' &&
    pipeline.beforeSend(assembled, baggage.domainContext) === false
  ) {
    return
  }

  pipeline.notifications.notify({
    type: 'event_collected',
    event: assembled,
    baggage,
  })
}
