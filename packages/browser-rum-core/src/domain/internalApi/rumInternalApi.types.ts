// Public types of the RUM internal API ("thin layer"), described in /rum-thin-layer.ts and
// crash-tested per /plan.md. The internal API focuses on event assembly: it assembles events
// respecting the RUM event hierarchy (view / action linkage, event counts, document versions),
// and offers extendability (hooks) and observability (notifications, queries) APIs.
//
// Out of scope, provided to consumers separately when needed: session state mutation and
// expiration, configuration, telemetry, transport / encoding, context management.

import type { ClocksState, Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/js-core/time'
import type { RecursivePartial } from '@datadog/js-core/util'
import type {
  Observable,
  Context,
  ErrorSource,
  ResourceType,
  SessionContext,
  SessionManager,
} from '@datadog/browser-core'
import type { SKIPPED, DISCARDED } from '@datadog/js-core/assembly'
import type { ActionType, VitalType } from '../../rawRumEvent.types'

export type InternalRumEventType = 'view' | 'action' | 'resource' | 'error' | 'long_task' | 'vital'

// The minimal set of RUM event properties to kickstart an event: the fields that make each event
// type a valid RUM event (ex: an error without `message` / `source` is not a valid RUM event),
// plus the fields needed for the event hierarchy (view url and name are applied to all child
// events). It is extended with caller-provided fields (metrics, context, target names...) and
// hook attributes to form a full fledged RumEvent. The kickoff objects intersect `Context`, so
// any other raw event field can be merged without duplicating the full raw event schema here.
// Internal fields (the event ids — view.id, action.id, error.id, resource.id, long_task.id,
// vital.id — plus event counts and _dd.document_version) are owned by the internal API: ids are
// stamped at startEvent()/addEvent() time (history entries and consumers need them from the
// start, ex: Replay reads the current view id), the others are set at assembly time.
export type BaseRumEvent =
  | {
      type: 'view'
      view: { url: string; name?: string } & Context
      service?: string
      version?: string
    }
  | { type: 'action'; action: { type: ActionType } & Context }
  | { type: 'error'; error: { message: string; source: ErrorSource } & Context }
  | { type: 'resource'; resource: { url: string; type: ResourceType } & Context }
  | { type: 'long_task'; long_task: { duration: ServerDuration } & Context }
  | { type: 'vital'; vital: { name: string; type: VitalType } & Context }

// The BaseRumEvent fields for a given event type, partially provided, plus any other raw event
// field the caller wants to merge (ex: view metrics, action target).
export type PartialBaseRumEvent<T extends InternalRumEventType> = RecursivePartial<Extract<BaseRumEvent, { type: T }>> &
  Context

export type AssembledRumEvent = BaseRumEvent & { date: TimeStamp } & Context

// Additional information carried along events through the internal API. The event history and
// notifications expose it so consumers (ex: Profiling) can build histories without subscribing
// to raw event collection. `duration` is the relative event duration: history queries rely on it
// (ex: Profiling computes long task windows), and the event's server duration field is lossy.
export interface EventBaggage {
  startClocks: ClocksState
  duration?: Duration
  domainContext?: unknown
  // The value the event was derived from, when relevant (ex: the original error instance)
  originalError?: unknown
}

// An incomplete BaseRumEvent: any event field (incl. kickoff fields) may be partially provided.
// The same event shape flows through startEvent(), update() and stop(). Views must start complete
// (enforced by the startEvent overloads), because their hierarchy fields (view.url, view.name,
// service, version) are applied to all child events as soon as they start. Non-view events start
// as partials: their kickoff fields (ex: resource.type, computed from stop options) may not be
// known at start, so they can be provided at start or at stop() (completeness is validated at
// runtime, per the throw-on-misuse policy). Incomplete history entries hold one.
export type IncompleteBaseRumEvent = PartialBaseRumEvent<InternalRumEventType>

export type StartableRumEventType = 'view' | 'action' | 'resource' | 'vital'

export interface AddEventOptions {
  // Kickoff fields must be present: addEvent is one-shot, there is no stop() to complete them.
  baseRumEvent: Exclude<BaseRumEvent, { type: 'view' }> & Context
  // Carried along the event: `startClocks` defaults to now, and `duration` (ex: long task
  // durations) is used by history queries.
  baggage?: Partial<EventBaggage>
}

// Only views can be updated: the event type makes `update` unavailable on other handles (and the
// runtime throws too, if the type constraint is worked around).
export interface ViewEventHandle {
  // Throws if the event has already been stopped or cancelled, and if the event is a view (views
  // must be stopped, not cancelled).
  cancel(): void
  // Deep-merges the given properties into the event, then assembles it (hooks, hierarchy, rate
  // limiting, beforeSend) and notifies `event_collected`. Views are sent incrementally: each
  // update emits a new event version, with `_dd.document_version` incremented (owned by the
  // internal API; the backend keeps the latest version). Throws if the event has already been
  // stopped or cancelled.
  update(baseRumEvent: PartialBaseRumEvent<'view'>): void
  // Finish assembling the event and notify `event_collected` with the final version. The caller
  // computes stop-side values. `endClocks` lets the caller control the event end time (ex: click
  // actions end when page activity ends, not when stop() is called). Throws if the event has
  // already been stopped or cancelled.
  stop(baseRumEvent?: PartialBaseRumEvent<'view'>, options?: { endClocks?: ClocksState }): void
}

// Non-view started events cannot be updated, so their kickoff fields must be complete by stop:
// they can be provided at start or at stop(), and the accumulated event is validated at runtime
// (per the throw-on-misuse policy).
export interface NonViewEventHandle<T extends 'action' | 'resource' | 'vital'> {
  // Throws if the event has already been stopped or cancelled, and if the event is a view (views
  // must be stopped, not cancelled).
  cancel(): void
  // Finish assembling the event and notify `event_collected` with the final version. The caller
  // computes stop-side values (ex: resource type from stopOptions). `endClocks` lets the caller
  // control the event end time. Throws if the event has already been stopped or cancelled, and
  // if kickoff fields are missing.
  stop(baseRumEvent?: PartialBaseRumEvent<T>, options?: { endClocks?: ClocksState }): void
}

export interface AssembleHookParams {
  readonly eventType: InternalRumEventType
  // The event being assembled: hierarchy fields (view / action linkage, event counts, document
  // version) are already applied. Hook callbacks add / adjust attributes by returning them, they
  // don't mutate the event.
  readonly event: AssembledRumEvent
  readonly startTime: RelativeTime
  readonly baggage: EventBaggage
}

export type AssembleHookCallback = (params: AssembleHookParams) => Context | typeof DISCARDED | typeof SKIPPED

export type BeforeSend = (event: AssembledRumEvent, domainContext: unknown) => boolean | void

// An entry of the event history. Incomplete entries are events that have been started but not
// finalized yet (ex: the active view, an ongoing vital, or any event while the session manager
// promise has not resolved): their `event` is the base event being built — the same object the handle
// mutates, so it always reflects the latest state. Complete entries carry the assembled event
// (hierarchy fields, hook attributes and event counts applied). Both carry the event baggage.
//
// Note: `AssembledRumEvent` stands in for the schema-typed `RumEvent` until all contexts (ex:
// session, user, display) are ported to hooks.
export type RumEventHistoryEntry =
  | { complete: true; event: AssembledRumEvent; baggage: EventBaggage }
  | { complete: false; event: IncompleteBaseRumEvent; baggage: EventBaggage }

export interface FindEventsQuery {
  type?: InternalRumEventType
  // All bounds are inclusive. Un-ended events (ex. the active view) match `endedAfter` for any
  // time, so `{ startedBefore: t, endedAfter: t }` means "active at t".
  startedAfter?: RelativeTime
  startedBefore?: RelativeTime
  endedAfter?: RelativeTime
  endedBefore?: RelativeTime
}

export type RumInternalNotification =
  // Fired synchronously at startEvent(), before any assembly: Replay takes full snapshots on
  // view start, before any DOM mutation, and needs the view id immediately.
  | { type: 'event_started'; eventType: StartableRumEventType; eventId: string; baggage: EventBaggage }
  | { type: 'event_collected'; event: AssembledRumEvent; baggage: EventBaggage }
  | { type: 'session_renewed' }
  | { type: 'session_expired' }

export interface RumInternalApi {
  // Start an event that has a duration. While it is active, child events are linked to it (ex:
  // errors and resources happening during an action get `action.id`; every event gets `view.id`,
  // `view.name` and `view.url` of the active view). The optional baggage lets the caller control
  // the event start time (ex: the initial view starts at the clock origin, click actions start at
  // the interaction timestamp) and carry domain context. Views must be complete at start (the
  // hierarchy fields are required); non-view events may be partial.
  startEvent(options: Extract<BaseRumEvent, { type: 'view' }>, baggage?: Partial<EventBaggage>): ViewEventHandle
  startEvent(
    options: IncompleteBaseRumEvent & { type: 'action' },
    baggage?: Partial<EventBaggage>
  ): NonViewEventHandle<'action'>
  startEvent(
    options: IncompleteBaseRumEvent & { type: 'resource' },
    baggage?: Partial<EventBaggage>
  ): NonViewEventHandle<'resource'>
  startEvent(
    options: IncompleteBaseRumEvent & { type: 'vital' },
    baggage?: Partial<EventBaggage>
  ): NonViewEventHandle<'vital'>
  // One-shot event assembly, when startEvent is not useful (ex: errors, long tasks, resources
  // notified after they are finished, one-shot vitals...). Views must go through startEvent.
  addEvent(options: AddEventOptions): void
  // Extend event assembly: the callback receives the event being assembled (hierarchy fields
  // already applied) and can add / adjust attributes by returning them, or return DISCARDED to
  // drop the event.
  registerHook(callback: AssembleHookCallback): { stop(): void }
  // Single observable for everything happening in the internal API, so the interface stays small.
  // Consumers subscribe once and switch on the notification type.
  //
  // `event_collected` fires as soon as the event can be assembled and made it through the
  // pipeline: assemblies are held while the session manager has not resolved yet, or while no
  // view covers the event start time (ex: before the initial view is started, as preStartRum
  // buffers calls collected before RUM starts), instead of being dropped.
  //
  // Discarded events (rate limited, beforeSend returned false) are not notified: no consumer
  // needs them. Event counters and `findEvents` include them, since hierarchy lookups and counts
  // are computed before rate limiting.
  notifications: Observable<RumInternalNotification>
  // Query the event history. History entries are created at startEvent()/addEvent() time, NOT at
  // collection time: started but uncollected events (ex: an ongoing vital) are findable as
  // incomplete entries, with their kickoff fields (ex: vital names). Finalized events are
  // complete entries carrying the assembled event and its baggage.
  findEvents(query: FindEventsQuery): RumEventHistoryEntry[]
  // Find the session that is active during `startTime` (delegates to the session manager).
  // Returns `undefined` while the session manager promise has not resolved yet, and when no
  // session is active at this time.
  findSession(startTime?: RelativeTime): SessionContext | undefined
  stop(): void
}

export interface RumInternalApiOptions {
  // The session manager, or a promise resolving it once tracking consent is granted and the
  // session store is initialized (ex: the promise returned by startSessionManager()). Events
  // collected before it resolves are assembled and notified when it does, so the internal API
  // can be created eagerly (phase 2 (b) of the PoC). If the promise resolves `undefined` (no
  // storage available), events are held and never assembled: as today, when the session manager
  // cannot be created, RUM does not start and collected events are never sent.
  sessionManager: SessionManager | Promise<SessionManager | undefined>
  beforeSend?: BeforeSend
  // Maximum number of events by type and by minute, for rate limited types (error, action, vital).
  eventRateLimit?: number
}
