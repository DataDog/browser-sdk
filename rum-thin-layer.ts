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
type RumEventHistoryEntry = any // an entry of the event history (id, type, start/end times, ...)
type SessionContext = any // from browser-core

declare function createRumInternalApi(options: {
  sessionManager: SessionManager
  beforeSend?: (event: AssembledRumEvent, domainContext: unknown) => boolean | void
  // Rate limiting and beforeSend are handled internally, in order: hooks -> rate limiting ->
  // beforeSend. `notifications` (and the transport plugged on it) only see events that passed
  // both, so the transport keeps a dumb "just send" contract.
}): RumInternalApi

// BaseRumEvent is the minimal set of RUM event properties to kickstart an event. It is extended
// using hooks to form a full fledged RumEvent. Free functions are exported to format inputs the
// RUM way (ex: turn an unknown error into a RUM error event), so that callers don't have to
// reimplement RUM formatting rules.
interface BaseRumEvent {
  type: string /* ... */
}

// StartEventOptions receives only the minimal amount of properties that are needed for event
// hierarchy assembly (ex: view.name of the current view is applied to all child events, so it
// needs to be known on start), plus the generic `name` needed by history queries.
type StartEventOptions = {
  // `name` is not type-specific: it is the event label (views already had it, actions and
  // resources know theirs at start too). It must be available at start time for history queries
  // (Profiling looks up vital names for ongoing vitals via findEvents).
  name?: string
  service?: string
  version?: string
} & (
  | {
      type: 'view'
      // Throws if another view is already active: the caller must stop() the previous view
      // before starting a new one. There is no implicit supersession.
    }
  | {
      type: 'action' | 'resource' | 'vital'
    }
)
// StartEventOptions intentionally does NOT accept other type-specific base event fields (ex:
// click target/position, resource url): callers can build that context on top of the internal
// API. We learned from eventTracker.ts that "useful" start-time context APIs get weird fast.
// Revisit only if the PoC shows a real need.

interface EventHandle {
  // Throw if the event has already been stopped or cancelled.
  cancel(): void // cancel is useful for tracking click actions
  // Deep-merges the given properties into the event, then assembles it (hooks, hierarchy, rate
  // limiting, beforeSend) and notifies `event_collected`. Views are sent incrementally: each
  // update emits a new event version, with `_dd.document_version` incremented (owned by the
  // internal API; the backend keeps the latest version). Only views can be updated: throws when
  // called on other event types (resources pass their stop-side values to stop()). Throws if the
  // event has already been stopped or cancelled.
  update(baseRumEvent: Partial<BaseRumEvent>): void
  // Finish assembling the event and notify `event_collected` with the final version. The caller
  // computes stop-side values (ex: resource type from stopOptions). Throws if the event has
  // already been stopped or cancelled.
  stop(baseRumEvent?: Partial<BaseRumEvent>): void
}

interface RumInternalApi {
  // Start an event that has a duration. While it is active, child events are linked to it
  // (ex: errors and resources happening during an action get `action.id`; every event gets
  // `view.id` of the active view).
  startEvent(options: StartEventOptions): EventHandle

  // One-shot event assembly, when startEvent is not useful (ex: errors, long tasks, resources
  // notified after they are finished, one-shot vitals...). Views must go through startEvent:
  // addEvent throws when passed a view event.
  addEvent(options: { baseRumEvent: BaseRumEvent; startClocks?: ClocksState; domainContext?: unknown }): void

  // Extend event assembly. Corresponds to hook.register(callback): callbacks receive the event
  // being assembled and can add/adjust attributes, or return DISCARDED to drop the event.
  // Note: event counters (view.error.count, view.action.count, ...) are owned by the internal API
  // and computed automatically, not through hooks.
  registerHook(callback: (params: { event: BaseRumEvent; startTime: RelativeTime /* ... */ }) => any): {
    stop(): void
  }

  // Single observable for everything happening in the internal API, so the interface stays small.
  // Consumers subscribe once and switch on the notification type.
  notifications: Observable<RumInternalNotification>
  // Discarded events (rate limited, beforeSend returned false) are not notified: no consumer
  // needs them, and reporting rate limiting to customers is handled internally.
  // Note: event counters and `findEvents` include discarded events, since hierarchy lookups and
  // counts are computed before rate limiting.

  // Query the event history (backed by a ValueHistory for example). Covers:
  // * hierarchy lookups done by the internal API itself (find the action active at a given time)
  // * consumer use-cases (Replay finding the current view, Profiling finding long tasks/actions
  //   that overlap a profile)
  // History entries are created at startEvent()/addEvent() time, NOT at collection time: started
  // but uncollected events (ex: an ongoing vital) are findable, including their `name`. They
  // carry the event EventBaggage and are updated as the event is assembled.
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
  findSession(startTime?: RelativeTime): SessionContext[]
}

type RumInternalNotification =
  // Fired synchronously at startEvent(), before any assembly: Replay takes full snapshots
  // on view start, before any DOM mutation, and needs the view id immediately.
  | ({ type: 'event_started'; eventType: StartEventOptions['type']; eventId: string } & EventBaggage)
  | ({ type: 'event_collected'; event: AssembledRumEvent; duration?: number } & EventBaggage)
  | { type: 'session_renewed' }
  | { type: 'session_expired' }

// Additional information carried along events through the internal API. The event history and
// notifications expose it so consumers (ex: Profiling) can build histories without subscribing to
// raw event collection.
interface EventBaggage {
  startClocks: ClocksState
  domainContext?: unknown
  // The value the event was derived from, when relevant (ex: the original error instance)
  originalError?: unknown
}
