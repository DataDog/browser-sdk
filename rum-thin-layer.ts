// PROPOSAL v3 — revised after the open-handles design discussion (plan-v3.md), on top of the
// PoC-validated v2. Validated by porting the public API, trackViews, trackClickActions, the
// five framework plugins, the profiler and a minimal Shopify SDK onto this interface. Not
// actual SDK code.
//
// The RUM internal API ("thin layer") has a strong focus on event assembly: assembling events
// respecting the RUM event hierarchy, and offering extendability (hooks) and observability
// (notifications, queries) APIs.
//
// The API is created eagerly (unconfigured) and buffers events — not calls — until configured,
// so public API calls made before init() flow into it directly. v3 removes the "single view at
// a time, always a view active" rule from the API itself: open event handles live in the
// history (`RumEventHistoryEntry.handle`), views are started and stopped by consumers (the
// public API creates the initial view unconditionally, starting at the clock origin), and only
// session-expiry endings are owned by the API (all open views are ended). Multiple
// simultaneous views are representable; a no-view model is one assembly-gate relaxation away.
//
// Invalid usages of startEvent/addEvent and of the returned event handles always throw (ex:
// updating a non-view event, reusing a finished handle, starting a view without `view.url`).
// Misuses fail loudly during development rather than producing silently-wrong events. We could
// reflect some of these constraints in types too, but it would complexify the API surface, so we
// rely on runtime errors for now. One deliberate exception: starting a view while another is
// open is NOT a throw — the multi-view model is a possible future, not necessarily a misuse —
// it logs a telemetry debug (no user-visible event).
//
// Out of scope (provided to consumers separately from the RumInternalApi instance, when needed):
// * session state mutation (`sessionManager` instance is shared; the API only reacts to its
//   expiry/renewal observables, to end views and notify)
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
// finalized yet (ex: an open view, an ongoing vital, or any event held while the API is not
// configured or the session manager has not resolved): their `event` is the base event being
// built — the same object the handle mutates, so it always reflects the latest state — and
// they carry the live `handle` (cleared on stop/cancel: complete entries have none). Complete
// entries carry the assembled event (hierarchy fields, hook attributes and event counts
// applied). Both carry the event baggage.
//
// The history is the source of truth, notifications are live updates: consumers needing
// "the open view(s)" — including subscribers that attach after the events started, ex: view
// metrics at init() for an initial view started before init() — query findEvents({ open: true })
// instead of trusting notification timing.
//
// Note: `AssembledRumEvent` stands in for the schema-typed `RumEvent` until all contexts (ex:
// session, user, display) are ported to hooks.
type RumEventHistoryEntry =
  | { complete: true; event: AssembledRumEvent; baggage: EventBaggage }
  | {
      complete: false
      event: IncompleteBaseRumEvent
      baggage: EventBaggage
      handle: EventHandle<StartableRumEventType>
    }
type SessionContext = any // from browser-core
type Context = any // from browser-core
type RecursivePartial<T> = any // from js-core/util
type ActionType = any // from rawRumEvent.types
type ErrorSource = any // from browser-core
type ResourceType = any // from browser-core
type VitalType = any // from rawRumEvent.types
type ServerDuration = any // from js-core/time

// Created eagerly, with no options: the instance exists from the start (ex: at makeRumPublicApi
// time), so public API calls made before init() flow into it directly and buffer as events
// (held assemblies) rather than replayed calls. The public API starts the initial view right
// after this call (bare kickoff, clock origin): it buffers like any other event until
// configure() + session resolution. The validated configuration is bound later, by configure().
declare function createRumInternalApi(): RumInternalApi

// BaseRumEvent is the minimal set of RUM event properties to kickstart an event: the fields
// that make each event type a valid RUM event (ex: an error without `message` / `source` is not
// a valid RUM event), plus the fields needed for the event hierarchy (view url and name are
// applied to all child events). It is extended with caller-provided fields (metrics, context,
// target names...) and hook attributes to form a full fledged RumEvent. The kickoff objects
// intersect `Context`, so any other raw event field can be merged without duplicating the full
// raw event schema here. Internal fields (the event ids — view.id, action.id, error.id,
// resource.id, long_task.id, vital.id — plus event counts and _dd.document_version) are owned
// by the internal API: ids are stamped when the event enters the history (startEvent()/addEvent()
// time — history entries and consumers need them from the start, ex: Replay reads the current
// view id), the others are set at assembly time. Free functions are
// exported to format
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
// The same event shape flows through update() and stop(). Views start complete (a `view.url`
// kickoff is required: the caller always has one — ex: the public API passes the page location
// when it starts the initial view; their other fields arrive via update()); non-view events
// start as partials: their kickoff fields (ex: resource.type, computed from stop options) may
// not be known at start, so they can be provided at start or at stop() (completeness is
// validated at runtime, per the throw-on-misuse policy). Incomplete history entries hold one.
type IncompleteBaseRumEvent = PartialBaseRumEvent<InternalRumEventType>

type StartableRumEventType = 'view' | 'action' | 'resource' | 'vital'

// One handle family for every started event type (the former ViewEventHandle /
// NonViewEventHandle split is gone). Views are mutable documents (update()); the other started
// events own one-shot stop-side data and can be discarded mid-flight (cancel()). These members
// are type-constrained per event type and runtime-enforced (throw-on-misuse) when worked around.
interface EventHandle<T extends StartableRumEventType> {
  // The current in-memory state of the event: the live entry (its event is the same object the
  // handle mutates, so it always reflects the latest state — child event counts included, they
  // live directly on the event; after the final assembly it is the assembled event). Consumers
  // reading their own event state (ex: the click frustration computation needs whether a click
  // had child errors) don't need findEvents or `event_started` correlation for it.
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

interface RumInternalApi {
  // Bind the validated configuration, once init() succeeded. `sessionManager` is the session
  // manager, or a promise resolving it once tracking consent is granted and the session store
  // is initialized (ex: startSessionManager()). Assemblies collected before configure (or
  // before the promise resolves) are held, and assembled + notified once both conditions are
  // met. If the promise resolves `undefined` (no storage available), events are held forever:
  // as today, RUM does not start. Catching user errors in `beforeSend` is the caller's
  // responsibility (the public API wraps it with catchUserErrors before passing it). Rate
  // limiting and beforeSend are handled internally, in order: hooks -> rate limiting ->
  // beforeSend. `notifications` (and the transport plugged on it) only see events that passed
  // both, so the transport keeps a dumb "just send" contract.
  //
  // ORDERING: session expiry handling is owned by this API — on expiry it notifies
  // `session_expired` (synchronously, giving consumers a last-update slot for their open
  // views), then assembles ALL open views' final versions, before any consumer (ex: a transport
  // flushing its batch on expiry) can react. The first-subscriber ordering guarantee is
  // therefore structural: consumers subscribe on `notifications` and cannot race the view
  // endings.
  configure(options: {
    sessionManager: SessionManager | Promise<SessionManager | undefined>
    beforeSend?: (event: AssembledRumEvent, domainContext: unknown) => boolean | void
  }): void

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
  // pipeline: assemblies are held while the API is not configured yet, while the session
  // manager has not resolved yet, or while no view covers the event start time (ex: events
  // collected before RUM starts), instead of being dropped. The view-coverage gate is a
  // consumer-guaranteed invariant today — the public API starts the initial view eagerly, so
  // the coverage holds from the clock origin — and the single deliberate relaxation point if a
  // no-view model materializes.
  notifications: Observable<RumInternalNotification>
  // Lifecycle: `event_started` at startEvent() (every type, views included — including the
  // initial view, which the public API starts before init(): subscribers attaching later
  // catch up by querying findEvents({ open: true }), the history being the source of truth),
  // `event_updated` / `event_stopped` when an update / final assembly completes (carrying the
  // assembled event, regardless of rate limiting and beforeSend). "View end" is simply
  // `event_stopped` for a view event: consumer stops (manual startView, automatic view
  // tracking) and the API-owned session expiry both fire it. `event_collected` only fires for
  // events that passed rate limiting and beforeSend (discarded events are not collected: no
  // consumer needs them, and reporting rate limiting to customers is handled internally).
  // Note: event counters and `findEvents` include discarded events, since hierarchy lookups and
  // counts are computed before rate limiting.
  //
  // EXPIRY CONTRACT: `session_expired` notifies synchronously; consumers may send last fresh
  // updates of their open views during the notify (the expiry slot); when notify returns, the
  // API assembles every open view's final version and closes its activity windows. This makes
  // the "final view version upserted before the batch flushes" ordering structural: the API
  // ends the views before any consumer can react.

  // Query the event history. Covers:
  // * hierarchy lookups done by the internal API itself (find the action active at a given time)
  // * consumer use-cases (Replay finding the current view, Profiling finding long tasks/actions
  //   that overlap a profile)
  // History entries are created at startEvent()/addEvent() time, NOT at collection time, and
  // reference the event itself: open events (ex. an open view, an ongoing vital) are findable
  // as incomplete entries with their live `handle`, their kickoff fields (ex: vital names) and
  // the live state of the event being built. Finalized events are complete entries carrying
  // the assembled event and its baggage (including discarded ones, by design). Child event
  // counts live directly on the event (view.error.count, view.action.count, ... action.error.count,
  // ...), solely owned and computed by the internal API — seeded at start, incremented in place
  // as children assemble, so the live event and every version carry them: consumers (ex: the
  // click frustration computation) read them off the event instead of re-computing. Un-ended
  // events match `endedAfter: t` for any t, so `{ startedBefore: t, endedAfter: t }` means
  // "active at t".
  findEvents(query: {
    type?: string
    open?: boolean // only entries with a live handle — ex: "the open view(s)" catch-ups
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
  // on view start, before any DOM mutation, and needs the view id immediately. Note that the
  // initial view fires it before init() (the public API starts the view eagerly): subscribers
  // attaching later must not rely on having seen every `event_started` — they catch up on open
  // events via findEvents({ open: true }).
  // The kickoff event (its type's id is already stamped by the internal API) rides along:
  // consumers needing kickoff fields (ex: the profiler reads the view name) must not have to
  // correlate an `event_started` with a `findEvents` lookup (PoC phase 5 finding — the same
  // correlation problem that produced `handle.current()` for click counts). The object is the
  // live draft the handle mutates: read kickoff fields from it, don't hold on to it.
  | {
      type: 'event_started'
      eventType: StartableRumEventType
      eventId: string
      event: IncompleteBaseRumEvent
      baggage: EventBaggage
    }
  // Fired when an update assembly completes (ex: each incremental view version), and when a
  // final assembly completes (`stop()`, one-shot `addEvent`, or the API-owned session expiry
  // endings). Carries the assembled event, like `event_collected`, but fires
  // regardless of rate limiting / beforeSend (the event reached its final state even if it is
  // dropped before being sent). "View end" is simply `event_stopped` for view events.
  | { type: 'event_updated'; event: AssembledRumEvent; baggage: EventBaggage }
  | { type: 'event_stopped'; event: AssembledRumEvent; baggage: EventBaggage }
  | { type: 'event_collected'; event: AssembledRumEvent; baggage: EventBaggage }
  | { type: 'session_renewed' }
  | { type: 'session_expired' }

// Additional information carried along events through the internal API. The event history and
// notifications expose it so consumers (ex: Profiling) can build histories without subscribing to
// raw event collection. `duration` is the relative event duration: history queries rely on it
// (ex: Profiling computes long task windows), and the event's server duration field is lossy.
//
// Robustness note (PoC phase 5): the internal API does not validate baggage shapes — a malformed
// `startClocks` creates NaN history bounds that match every `findEvents` query. Worth a runtime
// validation or a branded `ClocksState` before rollout.
interface EventBaggage {
  startClocks: ClocksState
  duration?: number
  domainContext?: unknown
  // The value the event was derived from, when relevant (ex: the original error instance)
  originalError?: unknown
}
