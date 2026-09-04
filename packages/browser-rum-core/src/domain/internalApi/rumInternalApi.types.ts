// Public types of the RUM internal API ("thin layer"), described in /rum-thin-layer.ts (v3,
// see plan-v3.md). The internal API focuses on event assembly: it assembles events respecting
// the RUM event hierarchy (view / action linkage, event counts, document versions), and offers
// extendability (hooks) and observability (notifications, queries) APIs.
//
// v3: the API is created eagerly (unconfigured) and buffers events until configure() binds
// the validated configuration — pre-init public API calls flow into it directly, as buffered
// events rather than replayed calls. The "single view at a time, always a view active" rule
// lives in the consumers, not here: open event handles are exposed on history entries, views
// are started and stopped by consumers, and only session-expiry endings are owned by the API
// (all open views are ended).
//
// Out of scope, provided to consumers separately when needed: session state mutation,
// configuration, telemetry, transport / encoding, context management.

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
// stamped when the event enters the history (startEvent()/addEvent() time — history entries
// and consumers need them from the start, ex: Replay reads the current view id), the others are
// set at assembly time.
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
// notifications expose it so consumers (ex: Profiling) can build histories without subscribing to
// raw event collection. `duration` is the relative event duration: history queries rely on it
// (ex: Profiling computes long task windows), and the event's server duration field is lossy.
export interface EventBaggage {
  startClocks: ClocksState
  duration?: Duration
  domainContext?: unknown
  // The value the event was derived from, when relevant (ex: the original error instance)
  originalError?: unknown
}

// An incomplete BaseRumEvent: any event field (incl. kickoff fields) may be partially provided.
// The same event shape flows through update() and stop(). Views start complete (a `view.url`
// kickoff is required: the caller always has one — ex: the public API passes the page location
// when it starts the initial view; their other fields arrive via update()); non-view events
// start as partials: their kickoff fields (ex: resource.type, computed from stop options) may
// not be known at start, so they can be provided at start or at stop() (completeness is
// validated at runtime, per the throw-on-misuse policy). Incomplete history entries hold one.
export type IncompleteBaseRumEvent = PartialBaseRumEvent<InternalRumEventType>

export type StartableRumEventType = 'view' | 'action' | 'resource' | 'vital'

export interface AddEventOptions {
  // Kickoff fields must be present: addEvent is one-shot, there is no stop() to complete them.
  baseRumEvent: Exclude<BaseRumEvent, { type: 'view' }> & Context
  // Carried along the event: `startClocks` defaults to now, and `duration` (ex: long task
  // durations) is used by history queries.
  baggage?: Partial<EventBaggage>
}

// One handle family for every started event type (the former ViewEventHandle /
// NonViewEventHandle split is gone). Views are mutable documents (update()); the other started
// events own one-shot stop-side data and can be discarded mid-flight (cancel()). These members
// are runtime-enforced (throw-on-misuse) when used on the wrong event type.
export interface EventHandle<T extends StartableRumEventType> {
  // The current in-memory state of the event: the live entry (its event is the same object the
  // handle mutates, so it always reflects the latest state; after the final assembly it is the
  // assembled event; views and actions also carry their live child counts). Consumers reading
  // their own event state (ex: the click frustration computation needs whether a click had
  // child errors) don't need findEvents or `event_started` correlation for it.
  current(): RumEventHistoryEntry
  // Views only: deep-merges the given properties into the event, then assembles it (hooks,
  // hierarchy, rate limiting, beforeSend) and notifies `event_collected`. Views are sent
  // incrementally: each update emits a new event version, with `_dd.document_version`
  // incremented (owned by the internal API; the backend keeps the latest version). Throws once
  // the view has been stopped.
  update(baseRumEvent: PartialBaseRumEvent<'view'>): void
  // Non-views only: discard the event without a final assembly. (A started view is a fact: it
  // can only be stopped — cancelling it would orphan its child events.)
  cancel(): void
  // Finish assembling the event and notify `event_collected` with the final version. The
  // caller computes stop-side values (ex: resource type from stopOptions). `endClocks` lets
  // the caller control the event end time — for views, the view-tracking policy pins it to the
  // next view's start (supersede is a consumer now). For views, the API derives the final
  // `is_active: false` and `time_spent` from the activity bounds when the stop payload doesn't
  // provide them (the only view-specific assembly behavior left). Throws if the event has
  // already been stopped or cancelled, and if kickoff fields are missing.
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
// finalized yet (ex: the draft, the active view, an ongoing vital, or any event held while the
// API is not configured or the session manager has not resolved): their `event` is the base event
// being built — the same object the handle mutates, so it always reflects the latest state.
// Complete entries carry the assembled event (hierarchy fields, hook attributes applied). Both
// carry the event baggage.
//
// Child event counts live directly on the event (view.error.count, view.action.count, ...
// action.error.count, ...), not on the entry: they are API-owned fields seeded at start and
// incremented as children assemble, so the live event (ex: `handle.current().event`) and every
// assembled version carry them.
//
// Note: `AssembledRumEvent` stands in for the schema-typed `RumEvent` until all contexts (ex:
// session, user, display) are ported to hooks.
export type RumEventHistoryEntry =
  | { complete: true; event: AssembledRumEvent; baggage: EventBaggage }
  | {
      complete: false
      event: IncompleteBaseRumEvent
      baggage: EventBaggage
      // The live handle while the event is open; cleared once it is ended (stop() / cancel() /
      // the API-owned expiry endings). Consumers needing "the open view(s)" — including
      // subscribers attaching after the events started, ex: view metrics at init() for an
      // initial view started before init() — query findEvents({ open: true }) instead of
      // trusting notification timing (the history is the source of truth).
      handle?: EventHandle<StartableRumEventType>
    }

export interface FindEventsQuery {
  type?: InternalRumEventType
  // Only entries with a live handle (open events). ex: "the open view(s)" catch-ups — a
  // consumer attaching after the events started queries this instead of trusting that it saw
  // every event_started.
  open?: boolean
  // All bounds are inclusive. Un-ended events (ex. an open view) match `endedAfter` for any
  // time, so `{ startedBefore: t, endedAfter: t }` means "active at t".
  startedAfter?: RelativeTime
  startedBefore?: RelativeTime
  endedAfter?: RelativeTime
  endedBefore?: RelativeTime
}

export type RumInternalNotification =
  // Fired synchronously at startEvent(), before any assembly: Replay takes full snapshots on
  // view start, before any DOM mutation, and needs the view id immediately. Note that the
  // initial view fires it before init() (the public API starts the view eagerly): subscribers
  // attaching later must not rely on having seen every event_started — they catch up on open
  // events via findEvents({ open: true }). The kickoff event (its type's id is already stamped
  // by the internal API) rides along: consumers needing kickoff fields (ex: trackViews reads
  // the view loading_type) must not have to correlate an `event_started` with a `findEvents`
  // lookup (the same correlation problem that produced `handle.current()` for click counts).
  // The object is the live event the handle mutates: read kickoff fields from it, don't hold
  // on to it.
  | {
      type: 'event_started'
      eventType: StartableRumEventType
      eventId: string
      event: IncompleteBaseRumEvent
      baggage: EventBaggage
    }
  // Fired when an update assembly completes (ex: each incremental view version), and when a
  // final assembly completes (`stop()`, one-shot `addEvent`, or the API-owned session expiry
  // endings). Carries the assembled event, like `event_collected`, but fires regardless of rate
  // limiting / beforeSend (the event reached its final state even if it is dropped before being
  // sent). Consumers doing "on view end" work subscribe to `event_stopped` for view events.
  | { type: 'event_updated'; event: AssembledRumEvent; baggage: EventBaggage }
  | { type: 'event_stopped'; event: AssembledRumEvent; baggage: EventBaggage }
  | { type: 'event_collected'; event: AssembledRumEvent; baggage: EventBaggage }
  | { type: 'session_renewed' }
  | { type: 'session_expired' }

export interface ConfigureOptions {
  // The session manager, or a promise resolving it once tracking consent is granted and the
  // session store is initialized (ex: the promise returned by startSessionManager()). Assemblies
  // collected before configure (or before the promise resolves) are held, and assembled +
  // notified once both conditions are met. If the promise resolves `undefined` (no storage
  // available), events are held forever: as today, RUM does not start.
  sessionManager: SessionManager | Promise<SessionManager | undefined>
  beforeSend?: BeforeSend
  // Maximum number of events by type and by minute, for rate limited types (error, action, vital).
  eventRateLimit?: number
}

export interface RumInternalApi {
  // Bind the validated configuration, once init() succeeded. Throws if called twice (a second
  // init() is a public API concern, guarded upstream).
  //
  // ORDERING: session expiry handling is owned by this API — on expiry it notifies
  // `session_expired` (synchronously, giving consumers a last-update slot for their open
  // views), then assembles ALL open views' final versions, before any consumer (ex: a
  // transport flushing its batch on expiry) can react: this API subscribes the session manager
  // observables before any other consumer of the same promise, as long as it is configured
  // first (the public API calls configure() before starting the transport batch).
  configure(options: ConfigureOptions): void

  // Start an event that has a duration. While it is open, child events are linked to it (ex:
  // errors and resources happening during an action get `action.id`; events get `view.id`,
  // `view.name` and `view.url` of the view covering their start). The optional baggage lets the
  // caller control the event start time and carry domain context. Non-view events may be
  // partial.
  //
  // Views: a plain start — no promotion, no supersede, no single-view rule. `view.url` is
  // required (throw-on-misuse); `loading_type` is the caller's (the public API stamps
  // `initial_load` on the initial view it starts at the clock origin, view tracking passes
  // ROUTE_CHANGE / SESSION_RENEWAL / BF_CACHE). Starting a view while another is open is
  // allowed (multi-view is a possible future) but logs a telemetry debug, since today's
  // consumers supersede explicitly: the view-tracking policy (stop the previous view, end
  // pinned to the new start) lives in a consumer helper, not here.
  startEvent(
    options: Extract<BaseRumEvent, { type: 'view' }> & Context,
    baggage?: Partial<EventBaggage>
  ): EventHandle<'view'>
  startEvent(
    options: IncompleteBaseRumEvent & { type: 'action' },
    baggage?: Partial<EventBaggage>
  ): EventHandle<'action'>
  startEvent(
    options: IncompleteBaseRumEvent & { type: 'resource' },
    baggage?: Partial<EventBaggage>
  ): EventHandle<'resource'>
  startEvent(options: IncompleteBaseRumEvent & { type: 'vital' }, baggage?: Partial<EventBaggage>): EventHandle<'vital'>

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
  // pipeline: assemblies are held while the API is not configured yet, while the session manager
  // has not resolved yet, or while no started view covers the event start time, instead of
  // being dropped. The view-coverage gate is a consumer-guaranteed invariant today — the
  // public API starts the initial view eagerly, so the coverage holds from the clock origin —
  // and the single deliberate relaxation point if a no-view model materializes.
  //
  // EXPIRY CONTRACT: `session_expired` notifies synchronously; consumers may send last fresh
  // updates of their open views during the notify (the expiry slot); when notify returns, the
  // API assembles every open view's final version and closes its activity windows. This makes
  // the "final view version upserted before the batch flushes" ordering structural: the API
  // ends the views before any consumer can react.
  //
  // Discarded events (rate limited, beforeSend returned false) are not notified: no consumer
  // needs them. Event counters and `findEvents` include them, since hierarchy lookups and counts
  // are computed before rate limiting.
  notifications: Observable<RumInternalNotification>

  // Query the event history. History entries are created when the event enters it (startEvent(),
  // addEvent()), NOT at collection time: open events (ex. an open view, an ongoing vital) are
  // findable as incomplete entries with their live `handle`, their kickoff fields (ex: vital
  // names) and the live state of the event being built. Finalized events are complete entries
  // carrying the assembled event and its baggage (including discarded ones, by design). The
  // history is the source of truth, notifications are live updates.
  findEvents(query: FindEventsQuery): RumEventHistoryEntry[]

  // Find the session that is active during `startTime` (delegates to the session manager).
  // Returns `undefined` while the session manager has not resolved yet, and when no session is
  // active at this time.
  findSession(startTime?: RelativeTime): SessionContext | undefined

  // Cleanup: unsubscribe from session observables and clear the event history. Throws when the
  // API is used after stop.
  stop(): void
}
