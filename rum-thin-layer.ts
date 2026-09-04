// PROPOSAL v2 — revised after the v2 design discussion (plan-v2.md), on top of the PoC-validated
// v1 (debrief in plan.md, phase 6). Validated by porting the public API, trackViews,
// trackClickActions, the five framework plugins, the profiler and a minimal Shopify SDK onto
// this interface. Not actual SDK code.
//
// The RUM internal API ("thin layer") has a strong focus on event assembly: assembling events
// respecting the RUM event hierarchy, and offering extendability (hooks) and observability
// (notifications, queries) APIs.
//
// v2 moves pre-init support inside the API: it is created eagerly (unconfigured), buffers
// events — not calls — until configured, and exposes the current view as a draft from creation.
// Views are never stopped by callers: starting a view supersedes the previous one, and session
// expiry endings are owned by the API.
//
// Invalid usages of startEvent/addEvent and of the returned event handles always throw (ex:
// updating a non-view event, reusing a finished handle, promoting the draft without `view.url`).
// Misuses fail loudly during development rather than producing silently-wrong events. We could
// reflect some of these constraints in types too, but it would complexify the API surface, so we
// rely on runtime errors for now.
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
// finalized yet (ex: the draft, the active view, an ongoing vital, or any event held while the
// API is not configured or the session manager has not resolved): their `event` is the base
// event being built — the same object the handle mutates, so it always reflects the latest
// state. Complete entries carry the assembled event (hierarchy fields, hook attributes and
// event counts applied). Both carry the event baggage.
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

// Created eagerly, with no options: the instance exists from the start (ex: at makeRumPublicApi
// time), so public API calls made before init() flow into it directly and buffer as events
// (draft view updates, held assemblies) rather than replayed calls. The validated configuration
// is bound later, by configure().
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
// time; the draft's at creation — history entries and consumers need them from the start, ex:
// Replay reads the current view id), the others are set at assembly time. Free functions are
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
// The same event shape flows through startEvent(), update() and stop(). Views start incomplete
// as the draft (see RumInternalApi.currentView): their hierarchy fields (view.url, view.name,
// service, version) are provided by the promotion kickoff and applied to all child events from
// then on — child events collected before promotion are held and only assembled afterwards.
// Non-view events start as partials: their kickoff fields (ex: resource.type, computed from stop
// options) may not be known at start, so they can be provided at start or at stop()
// (completeness is validated at runtime, per the throw-on-misuse policy). Incomplete history
// entries hold one.
type IncompleteBaseRumEvent = PartialBaseRumEvent<InternalRumEventType>

type StartableRumEventType = 'view' | 'action' | 'resource' | 'vital'

// View handles never stop: only `current()` and `update()`. Endings (supersede, session expiry)
// are owned by the internal API, which assembles the final version (`is_active: false`,
// `time_spent` derived from the activity bounds) on its own. Only views can be updated: the
// event type makes `update` unavailable on other handles (and the runtime throws too, if the
// type constraint is worked around).
interface ViewEventHandle {
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
interface NonViewEventHandle<T extends 'action' | 'resource' | 'vital'> {
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
  // `session_expired` (synchronously, giving consumers a last-update slot), then assembles the
  // current view's final version, before any consumer (ex: a transport flushing its batch on
  // expiry) can react. The v1 first-subscriber ordering guarantee is therefore structural now:
  // consumers subscribe on `notifications` and cannot race the view ending.
  configure(options: {
    sessionManager: SessionManager | Promise<SessionManager | undefined>
    beforeSend?: (event: AssembledRumEvent, domainContext: unknown) => boolean | void
  }): void

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
  // (no `update({})` dance: the PoC showed every view consumer emitting it — same boilerplate
  // each time). A `view.url` must be provided at promotion (throw-on-misuse). A view startEvent
  // while a view is active SUPERSEDES it: the previous view's activity window closes at the new
  // view's start, and the API assembles its final version (`is_active: false`, `time_spent`
  // derived). Subsequent views carry their `loading_type` (ROUTE_CHANGE / SESSION_RENEWAL /
  // BF_CACHE) in the kickoff.
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
  // pipeline: assemblies are held while the API is not configured yet, while the session
  // manager has not resolved yet, or while no view covers the event start time (ex: events
  // collected before the draft is promoted, as preStartRum used to buffer calls collected
  // before RUM starts), instead of being dropped.
  notifications: Observable<RumInternalNotification>
  // Lifecycle: `event_started` at startEvent() (view promotion included; never for the draft
  // before promotion), `event_updated` / `event_stopped` when an update / final assembly
  // completes (carrying the assembled event, regardless of rate limiting and beforeSend —
  // "on view end" work subscribes to `event_stopped` for views: view endings are supersede and
  // session expiry, both owned by the API). `event_collected` only fires for events that passed
  // rate limiting and beforeSend (discarded events are not collected: no consumer needs them,
  // and reporting rate limiting to customers is handled internally).
  // Note: event counters and `findEvents` include discarded events, since hierarchy lookups and
  // counts are computed before rate limiting.
  //
  // EXPIRY CONTRACT: `session_expired` notifies synchronously; consumers may send a last fresh
  // update of the current view during the notify (the expiry slot); when notify returns, the
  // API assembles the view's final version and closes its activity window. This makes the
  // "final view version upserted before the batch flushes" ordering structural: the API ends
  // the view before any consumer can react.

  // Query the event history. Covers:
  // * hierarchy lookups done by the internal API itself (find the action active at a given time)
  // * consumer use-cases (Replay finding the current view, Profiling finding long tasks/actions
  //   that overlap a profile)
  // History entries are created at startEvent()/addEvent() time, NOT at collection time, and
  // reference the event itself: started but uncollected events (ex: an ongoing vital) are findable
  // as incomplete entries, with their kickoff fields (ex: vital names) and the live state of the
  // event being built. Finalized events are complete entries carrying the assembled event and
  // its baggage (including discarded ones, by design). View / action entries carry their live
  // child counts (`counts`), solely owned and computed by the internal API: consumers (ex: the
  // click frustration computation) read them off the entry instead of re-computing.
  // Un-ended events (ex. the active view, or a never-promoted draft) match `endedAfter: t` for
  // any t, so `{ startedBefore: t, endedAfter: t }` means "active at t".
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
  // on view start, before any DOM mutation, and needs the view id immediately. For views this
  // is the promotion / supersede moment — never fired for the draft before it is started
  // (nothing can record before init, and snapshots must happen at the real view start).
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
  // final assembly completes (`stop()`, one-shot `addEvent`, or the API-owned view endings:
  // supersede / session expiry). Carries the assembled event, like `event_collected`, but fires
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
