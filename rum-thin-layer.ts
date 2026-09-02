// DRAFT / PROPOSAL — not actual SDK code.
//
// The RUM internal API ("thin layer") has a strong focus on event assembly: assembling events
// respecting the RUM event hierarchy, and offering extendability (hooks) and observability
// (notifications, queries) APIs.
//
// Invalid usages of startEvent/addEvent and of the returned event handles always throw (ex:
// starting a view while another is active, updating a non-view event, reusing a finished handle).
// Misuses fail loudly during development rather than producing silently-wrong events. We could
// reflect some of these constraints in types too, but it would complexify the API surface, so we
// rely on runtime errors for now.
//
// Out of scope (provided to consumers separately from the RumInternalApi instance, when needed):
// * session state mutation and session expiration (`sessionManager` instance is shared)
// * configuration access (the `RumConfiguration` object keeps being passed to consumers)
// * telemetry
// * transport / encoding (`clientToken` and the encoder belong to the transport instance)
// * context management (set/get view, global, user, ... contexts stay in caller scope)

// The transport plugged on `notifications` is the Batch returned by `startRumBatch` (from
// browser-core). Incremental view versions rely on `batch.upsert(event, viewId)`, so a pending
// batch only holds the latest version of each view (see createBatchDispatcher and the
// betaEnableViewUpdates feature).
type Batch = any // from browser-core
type SessionManager = any // from browser-core
type Observable<T> = any // from js-core
type RelativeTime = any // from js-core/time
type ClocksState = any // from js-core/time
type AssembledRumEvent = any // a fully assembled RUM event, ready to be sent
type InternalRumEventType = any // 'view' | 'action' | 'resource' | 'error' | 'long_task' | 'vital'

// An entry of the event history. Incomplete entries are events that have been started but not
// finalized yet (ex: the active view, an ongoing vital, or any event while the session manager is
// promise has not resolved): their `event` is the base event being built — the same object the handle
// mutates, so it always reflects the latest state. Complete entries carry the assembled event
// (hierarchy fields, hook attributes and event counts applied). Both carry the event baggage.
//
// Note: `AssembledRumEvent` stands in for the schema-typed `RumEvent` until all contexts (ex:
// session, user, display) are ported to hooks.
type RumEventHistoryEntry =
  | { complete: true; event: AssembledRumEvent; baggage: EventBaggage }
  | { complete: false; event: IncompleteBaseRumEvent; baggage: EventBaggage }
type SessionContext = any // from browser-core
type Context = any // from browser-core
type RecursivePartial<T> = any // from js-core/util
type ActionType = any // from rawRumEvent.types
type ErrorSource = any // from browser-core
type ResourceType = any // from browser-core
type VitalType = any // from rawRumEvent.types
type ServerDuration = any // from js-core/time

declare function createRumInternalApi(options: {
  // The session manager, or a promise resolving it once tracking consent is granted and the
  // session store is initialized (ex: startSessionManager()). Events collected before it
  // resolves are assembled and notified when it does. If it resolves `undefined` (no storage
  // available), events are held and never assembled: as today, RUM does not start.
  sessionManager: SessionManager | Promise<SessionManager | undefined>
  beforeSend?: (event: AssembledRumEvent, domainContext: unknown) => boolean | void
  // Rate limiting and beforeSend are handled internally, in order: hooks -> rate limiting ->
  // beforeSend. `notifications` (and the transport plugged on it) only see events that passed
  // both, so the transport keeps a dumb "just send" contract.
}): RumInternalApi

// BaseRumEvent is the minimal set of RUM event properties to kickstart an event: the fields
// that make each event type a valid RUM event (ex: an error without `message` / `source` is not
// a valid RUM event), plus the fields needed for the event hierarchy (view url and name are
// applied to all child events). It is extended with caller-provided fields (metrics, context,
// target names...) and hook attributes to form a full fledged RumEvent. The kickoff objects
// intersect `Context`, so any other raw event field can be merged without duplicating the full
// raw event schema here. Internal fields (the event ids — view.id, action.id, error.id,
// resource.id, long_task.id, vital.id — plus event counts and _dd.document_version) are owned
// by the internal API: ids are stamped at startEvent()/addEvent() time (history entries and
// consumers need them from the start, ex: Replay reads the current view id), the others are set
// at assembly time. Free functions are exported to format
// inputs the RUM way (ex: turn an unknown error into a RUM error event), so that callers don't
// have to reimplement RUM formatting rules.
type BaseRumEvent =
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
type PartialBaseRumEvent<T extends string> = RecursivePartial<Extract<BaseRumEvent, { type: T }>> & Context

// An incomplete BaseRumEvent: any event field (incl. kickoff fields) may be partially provided.
// The same event shape flows through startEvent(), update() and stop(). Views must start complete
// (enforced by the startEvent overloads), because their hierarchy fields (view.url, view.name,
// service, version) are applied to all child events as soon as they start. Non-view events start
// as partials: their kickoff fields (ex: resource.type, computed from stop options) may not be
// known at start, so they can be provided at start or at stop() (completeness is validated at
// runtime, per the throw-on-misuse policy). Incomplete history entries hold one.
//
// Starting a view while another is active throws: the caller must stop() the previous view first.
// There is no implicit supersession.
type IncompleteBaseRumEvent = PartialBaseRumEvent<InternalRumEventType>

type StartableRumEventType = 'view' | 'action' | 'resource' | 'vital'

// Only views can be updated: the event type makes `update` unavailable on other handles (and
// the runtime throws too, if the type constraint is worked around).
interface ViewEventHandle {
  // Throw if the event has already been stopped or cancelled, and if the event is a view (views
  // must be stopped, not cancelled).
  cancel(): void // cancel is useful for tracking click actions
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
interface NonViewEventHandle<T extends 'action' | 'resource' | 'vital'> {
  // Throw if the event has already been stopped or cancelled, and if the event is a view (views
  // must be stopped, not cancelled).
  cancel(): void
  // Finish assembling the event and notify `event_collected` with the final version. The
  // caller computes stop-side values (ex: resource type from stopOptions). `endClocks` lets the
  // caller control the event end time. Throws if the event has already been stopped or
  // cancelled, and if kickoff fields are missing.
  stop(baseRumEvent?: PartialBaseRumEvent<T>, options?: { endClocks?: ClocksState }): void
}

interface RumInternalApi {
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
  // notified after they are finished, one-shot vitals...). Views must go through startEvent:
  // addEvent throws when passed a view event. Kickoff fields must be present: addEvent is
  // one-shot, there is no stop() to complete them. The optional baggage carries the event
  // `startClocks` (defaults to now), `duration` (ex: long task durations, used by history queries),
  // `domainContext` and `originalError`.
  addEvent(options: {
    baseRumEvent: Exclude<BaseRumEvent, { type: 'view' }> & Context
    baggage?: Partial<EventBaggage>
  }): void

  // Extend event assembly. Corresponds to hook.register(callback): callbacks receive the event
  // being assembled and can add/adjust attributes, or return DISCARDED to drop the event.
  // Note: event counters (view.error.count, view.action.count, ...) are owned by the internal API
  // and computed automatically, not through hooks.
  registerHook(callback: (params: { event: BaseRumEvent; startTime: RelativeTime; baggage: EventBaggage }) => any): {
    stop(): void
  }

  // Single observable for everything happening in the internal API, so the interface stays small.
  // Consumers subscribe once and switch on the notification type.
  //
  // `event_collected` fires as soon as the event can be assembled and made it through the
  // pipeline: assemblies are held while the session manager has not resolved yet, or while no
  // view covers the event start time (ex: before the initial view is started, as preStartRum
  // buffers calls collected before RUM starts), instead of being dropped.
  notifications: Observable<RumInternalNotification>
  // Discarded events (rate limited, beforeSend returned false) are not notified: no consumer
  // needs them, and reporting rate limiting to customers is handled internally.
  // Note: event counters and `findEvents` include discarded events, since hierarchy lookups and
  // counts are computed before rate limiting.

  // Query the event history. Covers:
  // * hierarchy lookups done by the internal API itself (find the action active at a given time)
  // * consumer use-cases (Replay finding the current view, Profiling finding long tasks/actions
  //   that overlap a profile)
  // History entries are created at startEvent()/addEvent() time, NOT at collection time, and
  // reference the event itself: started but uncollected events (ex: an ongoing vital) are findable
  // as incomplete entries, with their kickoff fields (ex: vital names) and the live state of the
  // event being built. Finalized events are complete entries carrying the assembled event and
  // its baggage (including discarded ones, by design).
  // Un-ended events (ex. the active view) match `endedAfter: t` for any t, so
  // `{ startedBefore: t, endedAfter: t }` means "active at t".
  findEvents(query: {
    type?: string
    startedAfter?: RelativeTime
    startedBefore?: RelativeTime
    endedAfter?: RelativeTime
    endedBefore?: RelativeTime
  }): RumEventHistoryEntry[]

  // Find the session that is active during `startTime` (delegates to the session manager).
  // Returns `undefined` while the session manager promise has not resolved yet, and when no
  // session is active at this time.
  findSession(startTime?: RelativeTime): SessionContext | undefined

  // Cleanup: unsubscribe from session observables and clear the event history. Throws when the
  // API is used after stop.
  stop(): void
}

type RumInternalNotification =
  // Fired synchronously at startEvent(), before any assembly: Replay takes full snapshots
  // on view start, before any DOM mutation, and needs the view id immediately.
  | { type: 'event_started'; eventType: StartableRumEventType; eventId: string; baggage: EventBaggage }
  | { type: 'event_collected'; event: AssembledRumEvent; baggage: EventBaggage }
  | { type: 'session_renewed' }
  | { type: 'session_expired' }

// Additional information carried along events through the internal API. The event history and
// notifications expose it so consumers (ex: Profiling) can build histories without subscribing to
// raw event collection. `duration` is the relative event duration: history queries rely on it
// (ex: Profiling computes long task windows), and the event's server duration field is lossy.
interface EventBaggage {
  startClocks: ClocksState
  duration?: number
  domainContext?: unknown
  // The value the event was derived from, when relevant (ex: the original error instance)
  originalError?: unknown
}
