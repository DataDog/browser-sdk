// Public types of the RUM internal API ("thin layer"), described in /rum-thin-layer.ts (v2,
// see plan-v2.md). The internal API focuses on event assembly: it assembles events respecting
// the RUM event hierarchy (view / action linkage, event counts, document versions), and offers
// extendability (hooks) and observability (notifications, queries) APIs.
//
// v2: the API is created eagerly (unconfigured) and buffers events until configure() binds the
// validated configuration — pre-init public API calls flow into it directly, as buffered events
// rather than replayed calls. The current view is exposed as a draft from creation, promoted by
// the first view startEvent. Views are never stopped by callers: starting a view supersedes the
// active one, and session expiry endings are owned by the API.
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
// stamped when the event enters the history (startEvent()/addEvent() time; the draft's at
// creation — history entries and consumers need them from the start, ex: Replay reads the
// current view id), the others are set at assembly time.
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
// The same event shape flows through startEvent(), update() and stop(). Views start incomplete
// as the draft (see RumInternalApi.currentView): their hierarchy fields (view.url, view.name,
// service, version) are provided by the promotion kickoff and applied to all child events from
// then on — child events collected before promotion are held and only assembled afterwards.
// Non-view events start as partials: their kickoff fields (ex: resource.type, computed from stop
// options) may not be known at start, so they can be provided at start or at stop() (completeness
// is validated at runtime, per the throw-on-misuse policy). Incomplete history entries hold one.
export type IncompleteBaseRumEvent = PartialBaseRumEvent<InternalRumEventType>

export type StartableRumEventType = 'view' | 'action' | 'resource' | 'vital'

export interface AddEventOptions {
  // Kickoff fields must be present: addEvent is one-shot, there is no stop() to complete them.
  baseRumEvent: Exclude<BaseRumEvent, { type: 'view' }> & Context
  // Carried along the event: `startClocks` defaults to now, and `duration` (ex: long task
  // durations) is used by history queries.
  baggage?: Partial<EventBaggage>
}

// View handles never stop: only `current()` and `update()`. Endings (supersede, session expiry)
// are owned by the internal API, which assembles the final version (`is_active: false`,
// `time_spent` derived from the activity bounds) on its own. Only views can be updated: the
// event type makes `update` unavailable on other handles (and the runtime throws too, if the
// type constraint is worked around).
export interface ViewEventHandle {
  // The current in-memory state of the event: the live entry (its event is the same object the
  // handle mutates, so it always reflects the latest state; after the final assembly it is the
  // assembled event; views also carry their live child counts). Consumers reading their own
  // event state (ex: the click frustration computation needs whether a click had child errors)
  // don't need findEvents or `event_started` correlation for it.
  current(): RumEventHistoryEntry
  // Deep-merges the given properties into the event, then assembles it (hooks, hierarchy, rate
  // limiting, beforeSend) and notifies `event_collected`. Views are sent incrementally: each
  // update emits a new event version, with `_dd.document_version` incremented (owned by the
  // internal API; the backend keeps the latest version). Accepted before the view is started
  // (draft updates buffer as part of the eventual kickoff state, with true call-time
  // timestamps); throws once the view has been ended (superseded or expired).
  update(baseRumEvent: PartialBaseRumEvent<'view'>): void
}

// Non-view started events cannot be updated, so their kickoff fields must be complete by stop:
// they can be provided at start or at stop(), and the accumulated event is validated at runtime
// (per the throw-on-misuse policy).
export interface NonViewEventHandle<T extends 'action' | 'resource' | 'vital'> {
  // The current in-memory state of the event: the live entry (its event is the same object the
  // handle mutates, so it always reflects the latest state; after the final assembly it is the
  // assembled event; actions also carry their live child counts). Consumers reading their own
  // event state (ex: the click frustration computation needs whether a click had child errors)
  // don't need findEvents or `event_started` correlation for it.
  current(): RumEventHistoryEntry
  // Throw if the event has already been stopped or cancelled. (Views go through
  // ViewEventHandle, which has no cancel — their endings are owned by the API.)
  cancel(): void
  // Finish assembling the event and notify `event_collected` with the final version. The
  // caller computes stop-side values (ex: resource type from stopOptions). `endClocks` lets the
  // caller control the event end time. Throws if the event has already been stopped or
  // cancelled, and if kickoff fields are missing.
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

// Child event counts, solely owned and computed by the internal API: views count their error /
// action / long_task / resource / frustration children, actions count their error / long_task /
// resource children (the action / frustration counts stay 0 on actions). Exposed on history
// entries so consumers can read the live counts of ongoing events (ex: the click frustration
// computation needs whether a click had child errors).
export interface EventCounts {
  errorCount: number
  actionCount: number
  longTaskCount: number
  resourceCount: number
  frustrationCount: number
}

// An entry of the event history. Incomplete entries are events that have been started but not
// finalized yet (ex: the draft, the active view, an ongoing vital, or any event held while the
// API is not configured or the session manager has not resolved): their `event` is the base event
// being built — the same object the handle mutates, so it always reflects the latest state.
// Complete entries carry the assembled event (hierarchy fields, hook attributes applied). Both
// carry the event baggage, and the live child counts when the event is a hierarchy owner
// (view / action).
//
// Note: `AssembledRumEvent` stands in for the schema-typed `RumEvent` until all contexts (ex:
// session, user, display) are ported to hooks.
export type RumEventHistoryEntry =
  | { complete: true; event: AssembledRumEvent; baggage: EventBaggage; counts?: EventCounts }
  | { complete: false; event: IncompleteBaseRumEvent; baggage: EventBaggage; counts?: EventCounts }

export interface FindEventsQuery {
  type?: InternalRumEventType
  // All bounds are inclusive. Un-ended events (ex. the active view, or a never-promoted draft)
  // match `endedAfter` for any time, so `{ startedBefore: t, endedAfter: t }` means "active at t".
  startedAfter?: RelativeTime
  startedBefore?: RelativeTime
  endedAfter?: RelativeTime
  endedBefore?: RelativeTime
}

export type RumInternalNotification =
  // Fired synchronously at startEvent(), before any assembly: Replay takes full snapshots on
  // view start, before any DOM mutation, and needs the view id immediately. For views this is
  // the promotion / supersede moment — never fired for the draft before it is started. The
  // kickoff event (its type's id is already stamped by the internal API) rides along: consumers
  // needing kickoff fields (ex: trackViews reads the view loading_type) must not have to
  // correlate an `event_started` with a `findEvents` lookup (the same correlation problem that
  // produced `handle.current()` for click counts). The object is the live draft the handle
  // mutates: read kickoff fields from it, don't hold on to it.
  | {
      type: 'event_started'
      eventType: StartableRumEventType
      eventId: string
      event: IncompleteBaseRumEvent
      baggage: EventBaggage
    }
  // Fired when an update assembly completes (ex: each incremental view version), and when a
  // final assembly completes (`stop()`, one-shot `addEvent`, or the API-owned view endings:
  // supersede / session expiry). Carries the assembled event, like `event_collected`, but fires
  // regardless of rate limiting / beforeSend (the event reached its final state even if it is
  // dropped before being sent). Consumers doing "on view end" work subscribe to `event_stopped`
  // for view events.
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
  // `session_expired` (synchronously, giving consumers a last-update slot), then assembles the
  // current view's final version, before any consumer (ex: a transport flushing its batch on
  // expiry) can react: this API subscribes the session manager observables before any other
  // consumer of the same promise, as long as it is configured first (the public API calls
  // configure() before starting the transport batch).
  configure(options: ConfigureOptions): void

  // The current view handle. From creation until the first view start it is the DRAFT: a real
  // event id is pre-assigned, the history entry starts at the clock origin, and `update()` is
  // accepted immediately — early view mutations (ex. setViewName / setViewContext / addTiming /
  // setViewLoadingTime before init()) buffer as part of the eventual kickoff state. No
  // `event_started` and no assembly until the draft is started (promoted): a never-promoted
  // draft (manual views, no startView call ever) stays visible-but-incomplete in findEvents
  // forever, and its buffered child events are never assembled. Afterwards, it is the
  // currently active view.
  currentView: ViewEventHandle

  // Start an event that has a duration. While it is active, child events are linked to it (ex:
  // errors and resources happening during an action get `action.id`; every event gets `view.id`,
  // `view.name` and `view.url` of the active view). The optional baggage lets the caller control
  // the event start time and carry domain context. Non-view events may be partial.
  //
  // Views: the FIRST view startEvent PROMOTES the draft — buffered draft updates are merged
  // first, the promotion kickoff over them (the same precedence as main's startView({name})),
  // the start clocks stay at the clock origin no matter when the call happens, `event_started`
  // fires, and the initial version is assembled + notified with `loading_type: 'initial_load'`
  // (no `update({})` dance). A `view.url` must be provided at promotion (throw-on-misuse). A
  // view startEvent while a view is active SUPERSEDES it: the previous view's activity window
  // closes at the new view's start, and the API assembles its final version (`is_active:
  // false`, `time_spent` derived). Subsequent views carry their `loading_type` (ROUTE_CHANGE /
  // SESSION_RENEWAL / BF_CACHE) in the kickoff.
  startEvent(
    options: Extract<BaseRumEvent, { type: 'view' }> & Context,
    baggage?: Partial<EventBaggage>
  ): ViewEventHandle
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
  // pipeline: assemblies are held while the API is not configured yet, while the session manager
  // has not resolved yet, or while no view covers the event start time (ex: events collected
  // before the draft is promoted, as preStartRum used to buffer calls collected before RUM
  // starts), instead of being dropped.
  //
  // EXPIRY CONTRACT: `session_expired` notifies synchronously; consumers may send a last fresh
  // update of the current view during the notify (the expiry slot); when notify returns, the API
  // assembles the view's final version and closes its activity window. This makes the "final
  // view version upserted before the batch flushes" ordering structural: the API ends the view
  // before any consumer can react.
  //
  // Discarded events (rate limited, beforeSend returned false) are not notified: no consumer
  // needs them. Event counters and `findEvents` include them, since hierarchy lookups and counts
  // are computed before rate limiting.
  notifications: Observable<RumInternalNotification>

  // Query the event history. History entries are created when the event enters it (startEvent(),
  // addEvent(), the draft at creation), NOT at collection time: started but uncollected events
  // (ex: an ongoing vital) are findable as incomplete entries, with their kickoff fields (ex:
  // vital names). Finalized events are complete entries carrying the assembled event and its
  // baggage (including discarded ones, by design).
  findEvents(query: FindEventsQuery): RumEventHistoryEntry[]

  // Find the session that is active during `startTime` (delegates to the session manager).
  // Returns `undefined` while the session manager has not resolved yet, and when no session is
  // active at this time.
  findSession(startTime?: RelativeTime): SessionContext | undefined

  // Cleanup: unsubscribe from session observables and clear the event history. Throws when the
  // API is used after stop.
  stop(): void
}
