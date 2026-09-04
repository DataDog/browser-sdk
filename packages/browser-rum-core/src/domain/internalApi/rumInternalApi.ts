// PoC v3 implementation of the RUM internal API ("thin layer"), described in /rum-thin-layer.ts
// and plan-v3.md. This module is the orchestrator: it owns the configuration binding, the
// assembly buffering and the session-expiry endings. The other pieces live in the sibling
// modules: the public types (rumInternalApi.types.ts), the draft event helpers
// (baseRumEvent.ts), the event history (eventHistory.ts) and the assembly pipeline
// (assembleRumEvent.ts).
//
// v3 design, in short:
// * Configuration: the API is created eagerly (unconfigured). configure() binds the
//   validated configuration (beforeSend, rate limits, session manager promise) — assemblies
//   collected before it are held, exactly like events collected before the session manager
//   resolves. If configure never happens, nothing is ever assembled: RUM does not start.
// * Views: plain started events — no draft, no promotion, no supersede, no single-view rule
//   here. Consumers start/stop them (the view-tracking policy lives in a consumer helper);
//   the API only owns the session-expiry endings (all open views, after the last-update slot)
//   and derives the final view fields (is_active, time_spent) at assembly. Open handles are
//   exposed on history entries, so consumers can catch up via findEvents({ open: true }).
// * Starting a view while another is open logs a telemetry debug (not a throw: overlapping
//   views are a possible future model, not necessarily a misuse).
//
// PoC notes / deviations from the current RUM behavior (v1 list, still true):
// * Rate limit reach is not surfaced to customers yet (today it reports an error event): wiring
//   that is deferred to a later phase of the PoC.
// * `ddtags` (built from the configuration) are not added to events: the configuration is out
//   of scope.
// * View events are exempt from rate limiting and cannot be dismissed by `beforeSend`, as today.

import type { ClocksState, RelativeTime } from '@datadog/js-core/time'
import { addDuration, clocksNow, elapsed, toServerDuration } from '@datadog/js-core/time'
import { createHook } from '@datadog/js-core/assembly'
import { deepClone, mergeInto } from '@datadog/js-core/util'
import type { Context, SessionContext, SessionManager } from '@datadog/browser-core'
import {
  Observable,
  addTelemetryDebug,
  createEventRateLimiter,
  generateUUID,
  monitorError,
  noop,
} from '@datadog/browser-core'
import { assertKickoffFields, stampEventId } from './baseRumEvent'
import type { DraftEvent } from './baseRumEvent'
import { createEventHistory, seedEventCounts } from './eventHistory'
import type { InternalHistoryEntry } from './eventHistory'
import { assembleRumEvent } from './assembleRumEvent'
import type { AssemblyPipeline, PendingAssembly } from './assembleRumEvent'
import type {
  AddEventOptions,
  AssembleHookCallback,
  BaseRumEvent,
  AssembleHookParams,
  ConfigureOptions,
  EventBaggage,
  EventHandle,
  FindEventsQuery,
  IncompleteBaseRumEvent,
  InternalRumEventType,
  RumEventHistoryEntry,
  RumInternalApi,
  RumInternalNotification,
  StartableRumEventType,
} from './rumInternalApi.types'

export type * from './rumInternalApi.types'

// Same limit as the preStartRum buffer, to bound memory usage while assemblies are buffered
// (see isAssemblyReady).
const PENDING_ASSEMBLIES_LIMIT = 500

const STARTABLE_EVENT_TYPES: readonly StartableRumEventType[] = ['view', 'action', 'resource', 'vital']
const ONE_SHOT_EVENT_TYPES: ReadonlyArray<Exclude<InternalRumEventType, 'view'>> = [
  'action',
  'error',
  'resource',
  'long_task',
  'vital',
]

// The state of an open view. The view handle closes over one of these: updates throw once the
// view has been stopped.
interface ViewState {
  eventId: string
  // The view event being built: the live object `update()` / `stop()` merges into.
  base: DraftEvent
  baggage: EventBaggage
  historyEntry: InternalHistoryEntry
  // Set at stop / expiry — the activity window end. Stopped views reject updates.
  endedClocks: ClocksState | undefined
}

export function createRumInternalApi(): RumInternalApi {
  const assembleHook = createHook<AssembleHookParams, Context>()
  const notificationsObservable = new Observable<RumInternalNotification>()
  const history = createEventHistory()
  // The pipeline is mutable: configure() binds beforeSend and the rate limiters. Assemblies only
  // run once it is configured, so consumers never see an unconfigured assembly.
  const pipeline: AssemblyPipeline = {
    history,
    assembleHook,
    rateLimiters: {},
    beforeSend: undefined,
    notifications: notificationsObservable,
  }
  let sessionManager: SessionManager | undefined
  let sessionSubscriptions: Array<() => void> = []
  const pendingAssemblies: PendingAssembly[] = []
  let stopped = false
  let configured = false

  // The open views, for the API-owned expiry endings and the overlap telemetry guard. The
  // single-view policy lives in the consumers (the public API); the API stays agnostic.
  const openViewStates = new Set<ViewState>()

  return {
    startEvent,
    addEvent,
    registerHook,
    configure,
    get notifications() {
      return notificationsObservable
    },
    findEvents,
    findSession,
    stop: stopApi,
  }

  //
  // Views
  //

  // The view handle: views are mutable documents (update), and stop() ends the activity window
  // (the caller pins the end clocks — ex: the view-tracking policy pins it to the next view's
  // start, since supersede is a consumer now). The final `is_active: false` / `time_spent` are
  // derived by the API at assembly.
  function createViewHandle(view: ViewState): EventHandle<'view'> {
    return {
      current: () => view.historyEntry.value,
      update(partial) {
        assertNotStopped()
        if (view.endedClocks !== undefined) {
          throw new Error('The view has already been stopped.')
        }
        mergeInto(view.base, partial)
        assembleViewState(view, { final: false })
      },
      cancel() {
        // A started view is a fact: it can only be stopped — cancelling it would orphan its
        // child events.
        throw new Error('A view cannot be cancelled.')
      },
      stop(partial, stopOptions) {
        assertNotStopped()
        if (view.endedClocks !== undefined) {
          throw new Error('The view has already been stopped.')
        }
        if (partial !== undefined) {
          mergeInto(view.base, partial)
        }
        endView(view, stopOptions?.endClocks ?? clocksNow())
        assembleViewState(view, { final: true })
      },
    }
  }

  // Public dispatcher: the overloads below mirror the RumInternalApi interface (the view one
  // requires a complete kickoff at the type level; the runtime url check in startView is a
  // defense against type-constraint workarounds). The implementation signature routes views
  // and the rest to their start functions, keeping the runtime misuse guards.
  function startEvent(
    options: Extract<BaseRumEvent, { type: 'view' }>,
    baggage?: Partial<EventBaggage>
  ): EventHandle<'view'>
  function startEvent(
    options: IncompleteBaseRumEvent & { type: 'action' },
    baggage?: Partial<EventBaggage>
  ): EventHandle<'action'>
  function startEvent(
    options: IncompleteBaseRumEvent & { type: 'resource' },
    baggage?: Partial<EventBaggage>
  ): EventHandle<'resource'>
  function startEvent(
    options: IncompleteBaseRumEvent & { type: 'vital' },
    baggage?: Partial<EventBaggage>
  ): EventHandle<'vital'>
  function startEvent(
    startOptions: IncompleteBaseRumEvent & { type: StartableRumEventType },
    startBaggage?: Partial<EventBaggage>
  ): EventHandle<StartableRumEventType> {
    assertNotStopped()
    if (!STARTABLE_EVENT_TYPES.includes(startOptions.type)) {
      throw new Error(`Cannot start a '${startOptions.type}' event.`)
    }
    if (startOptions.type === 'view') {
      return startView(startOptions, startBaggage)
    }
    return startNonViewEvent(startOptions, startBaggage)
  }

  // A view is a plain started event: no promotion, no supersede, no single-view rule — the
  // view-tracking policy (stop the previous view, end pinned to the new start) lives in a
  // consumer helper, not here. `event_started` fires before any assembly (Replay takes full
  // snapshots on view start), the initial version is assembled + notified (held while not
  // ready, like every assembly), and child events held for view coverage may become ready.
  function startView(
    kickoff: IncompleteBaseRumEvent & { type: 'view' } & Context,
    startBaggage?: Partial<EventBaggage>
  ): EventHandle<'view'> {
    assertNotStopped()
    // The type requires a complete view kickoff; this runtime check is a defense against
    // type-constraint workarounds.
    if ((kickoff as { view?: { url?: string } }).view?.url === undefined) {
      throw new Error("Missing kickoff field 'view.url': a view cannot be started without it.")
    }
    if (openViewStates.size > 0) {
      // monitor-until: 2026-10-14
      // Not a throw: overlapping views are a possible future model, not necessarily a misuse.
      // Today's consumers supersede explicitly (the policy lives in a consumer helper).
      addTelemetryDebug('A view was started while another one is still open.', { openViews: openViewStates.size })
    }
    const startClocks = startBaggage?.startClocks ?? clocksNow()
    const eventId = generateUUID()
    const base = deepClone(kickoff) as DraftEvent
    stampEventId(base, eventId)
    seedEventCounts(base)
    history.initViewEntry(eventId)
    const baggage: EventBaggage = { ...startBaggage, startClocks }
    const historyEntry = history.addEntry({ complete: false, event: base, baggage }, startClocks.relative, eventId)
    const view: ViewState = { eventId, base, baggage, historyEntry, endedClocks: undefined }
    openViewStates.add(view)
    const handle = createViewHandle(view)
    if (!historyEntry.value.complete) {
      historyEntry.value.handle = handle
    }
    notifyEventStarted(view)
    // The initial view version is emitted by the API (no update({}) dance in consumers)
    assembleViewState(view, { final: false })
    // Child events held for view coverage may have become ready
    tryFlushPendingAssemblies()
    return handle
  }

  // Session expiry: the last-update slot is the synchronous `session_expired` notify — consumers
  // may update their open views during it. Once it returns, the API ends every open view and
  // assembles its final version, BEFORE any consumer can react (the transport subscribes the
  // session expiry flush after this API, see configure): the final version is upserted in the
  // batch before it flushes, structurally. Today's consumers keep a single view; ending all of
  // them keeps the API agnostic of that policy.
  function onSessionExpired() {
    notificationsObservable.notify({ type: 'session_expired' })
    // Copy first: endView mutates the set
    for (const view of Array.from(openViewStates)) {
      endView(view, clocksNow())
      assembleViewState(view, { final: true })
    }
  }

  // Close the view's activity window and clear it from the open views. The final version
  // (is_active false, time_spent derived from the activity bounds) is assembled separately, so
  // notification ordering stays explicit.
  function endView(view: ViewState, endClocks: ClocksState) {
    history.closeEntry(view.historyEntry, endClocks.relative)
    view.endedClocks = endClocks
    openViewStates.delete(view)
  }

  // Assemble a view version. The API owns the view lifecycle fields: is_active on every version,
  // time_spent on the final one (derived — that is why views don't need a stop()).
  function assembleViewState(view: ViewState, options: { final: boolean }) {
    if (options.final) {
      const endClocks = view.endedClocks
      if (endClocks === undefined) {
        throw new Error('The final version of a view is assembled after its activity window is closed (stop / expiry).')
      }
      mergeInto(view.base, {
        view: {
          is_active: false,
          time_spent: toServerDuration(elapsed(view.baggage.startClocks.timeStamp, endClocks.timeStamp)),
        },
      })
    } else {
      mergeInto(view.base, { view: { is_active: true } })
    }
    assembleAndNotify({
      baseRumEvent: view.base,
      historyEntry: view.historyEntry,
      eventId: view.eventId,
      final: options.final,
      baggage: view.baggage,
    })
  }

  function notifyEventStarted(view: ViewState) {
    notificationsObservable.notify({
      type: 'event_started',
      eventType: 'view',
      eventId: view.eventId,
      // The live base: consumers needing kickoff fields (ex: trackViews reads the loading type)
      // read them from it, without a findEvents correlation.
      event: view.base as IncompleteBaseRumEvent,
      baggage: view.baggage,
    })
  }

  //
  // Non-view events
  //

  function startNonViewEvent(
    startOptions: IncompleteBaseRumEvent & { type: 'action' | 'resource' | 'vital' },
    startBaggage?: Partial<EventBaggage>
  ): EventHandle<'action' | 'resource' | 'vital'> {
    const startClocks = startBaggage?.startClocks ?? clocksNow()
    const eventId = generateUUID()
    // The start options are (a partial of) the base event: the same event shape flows through
    // startEvent() and stop(). Cloned so caller-side mutations don't leak into the event being
    // built, and stamped with the id owned by the internal API, so history entries expose it from
    // the start.
    const base = deepClone(startOptions) as DraftEvent
    stampEventId(base, eventId)
    seedEventCounts(base)
    const baggage: EventBaggage = { ...startBaggage, startClocks }
    const historyEntry = history.addEntry({ complete: false, event: base, baggage }, startClocks.relative, eventId)
    let finished = false

    function assertNotFinished() {
      if (finished) {
        throw new Error('The event has already been stopped or cancelled.')
      }
    }

    // The handle carries all methods: the type-level constraints (kickoff fields required by
    // stop) are enforced at runtime, and exposed through the RumInternalApi.startEvent
    // overloads. Only the members valid for the event type work; the others throw.
    const handle: EventHandle<'action' | 'resource' | 'vital'> = {
      current: () => historyEntry.value,
      update() {
        // Only views are mutable documents
        throw new Error('Only views can be updated.')
      },
      cancel() {
        assertNotStopped()
        assertNotFinished()
        history.removeEntry(historyEntry)
        finished = true
      },
      stop(partial: Context, stopOptions?: { endClocks?: ClocksState }) {
        assertNotStopped()
        assertNotFinished()
        mergeInto(base, partial)
        assertKickoffFields(base)
        const endClocks = stopOptions?.endClocks ?? clocksNow()
        history.closeEntry(historyEntry, endClocks.relative)
        finished = true
        assembleAndNotify({
          baseRumEvent: base,
          historyEntry,
          eventId,
          final: true,
          baggage: { ...baggage, duration: elapsed(baggage.startClocks.timeStamp, endClocks.timeStamp) },
        })
      },
    }
    if (!historyEntry.value.complete) {
      historyEntry.value.handle = handle
    }
    notificationsObservable.notify({
      type: 'event_started',
      eventType: startOptions.type,
      eventId,
      event: base as IncompleteBaseRumEvent,
      baggage,
    })
    return handle
  }

  function addEvent(addOptions: AddEventOptions) {
    assertNotStopped()
    // Cast: callers could still pass a view event at runtime, and views must throw
    const type = addOptions.baseRumEvent.type as InternalRumEventType
    if (type === 'view') {
      throw new Error('Views must go through startEvent, so the event hierarchy stays well-formed.')
    }
    if (!ONE_SHOT_EVENT_TYPES.includes(type)) {
      throw new Error(`Unexpected event type: '${type}'.`)
    }
    const eventId = generateUUID()
    const baggage: EventBaggage = { ...addOptions.baggage, startClocks: addOptions.baggage?.startClocks ?? clocksNow() }
    // The base event is cloned (addEvent is one-shot, the caller may reuse its object) and the
    // event id owned by the internal API is stamped on it, so history entries expose it before
    // the assembly runs (ex: Profiling reads long task ids).
    const baseEvent = deepClone(addOptions.baseRumEvent) as DraftEvent
    stampEventId(baseEvent, eventId)
    seedEventCounts(baseEvent)
    const historyEntry = history.addEntry(
      { complete: false, event: baseEvent, baggage },
      baggage.startClocks.relative,
      eventId
    )
    if (baggage.duration !== undefined) {
      history.closeEntry(historyEntry, addDuration(baggage.startClocks.relative, baggage.duration))
    }
    if (type === 'action') {
      // One-shot actions (ex: public addAction) are instantaneous: close their window at their
      // start time, so child events never link to them (they would otherwise stay open forever,
      // as every entry starts un-ended)
      history.closeEntry(historyEntry, baggage.startClocks.relative)
    }
    assembleAndNotify({ baseRumEvent: baseEvent, historyEntry, eventId, final: true, baggage })
  }

  //
  // Configuration
  //

  function configure(options: ConfigureOptions) {
    assertNotStopped()
    if (configured) {
      throw new Error('The internal API is already configured.')
    }
    configured = true
    pipeline.beforeSend = options.beforeSend
    pipeline.rateLimiters = {
      // Rate limit reach is not surfaced to customers yet (see the PoC notes at the top)
      error: createEventRateLimiter('error', noop, options.eventRateLimit),
      action: createEventRateLimiter('action', noop, options.eventRateLimit),
      vital: createEventRateLimiter('vital', noop, options.eventRateLimit),
    }
    if (options.sessionManager instanceof Promise) {
      options.sessionManager
        .then((resolvedSessionManager) => {
          if (stopped || !resolvedSessionManager) {
            // Either stopped in the meantime, or no storage available for sessions: the session
            // manager will never be available (ex: startSessionManager() resolving `undefined`).
            // Keep holding buffered events: they are never assembled nor notified, mirroring the
            // current behavior where RUM does not start and the pre-start buffer is never flushed.
            return
          }
          setSessionManager(resolvedSessionManager)
        })
        .catch(monitorError)
    } else {
      setSessionManager(options.sessionManager)
    }
  }

  //
  // Session manager
  //

  // Subscribes the session observables. The public API calls configure() before starting the
  // transport batch, so the expiry subscription here runs FIRST: onSessionExpired (notify →
  // end the view → final version upserted in the batch) happens before the batch's own
  // expiry flush. The "final view version before flush" ordering is structural.
  function setSessionManager(newSessionManager: SessionManager) {
    sessionManager = newSessionManager
    const renewSubscription = newSessionManager.renewObservable.subscribe(() =>
      notificationsObservable.notify({ type: 'session_renewed' })
    )
    const expireSubscription = newSessionManager.expireObservable.subscribe(() => onSessionExpired())
    sessionSubscriptions.push(
      () => renewSubscription.unsubscribe(),
      () => expireSubscription.unsubscribe()
    )
    tryFlushPendingAssemblies()
  }

  //
  // Assembly
  //

  // An assembly is ready when the API is configured, the session manager has resolved, and a
  // started view covers the event start time. Views cover themselves (they start complete, and
  // stopped views still assemble their final version after their activity window closed, so
  // the coverage lookup is not used for them): their assemblies are only gated on
  // configuration + session.
  function isAssemblyReady(baseRumEvent: DraftEvent, startTime: RelativeTime): boolean {
    if (!sessionManager) {
      // Covers unconfigured too: the session manager is only set by configure()
      return false
    }
    if (baseRumEvent.type === 'view') {
      return true
    }
    return history.findViewAt(startTime) !== undefined
  }

  function assembleAndNotify({
    baseRumEvent,
    historyEntry,
    eventId,
    final,
    baggage,
  }: {
    baseRumEvent: DraftEvent
    historyEntry: InternalHistoryEntry
    eventId: string
    final: boolean
    baggage: EventBaggage
  }) {
    if (!isAssemblyReady(baseRumEvent, baggage.startClocks.relative)) {
      // Hold the assembly: it will run (hooks, hierarchy, counts, rate limiting, beforeSend,
      // notification) once it is ready. The base event is cloned because callers keep mutating it
      // (ex: view updates).
      pendingAssemblies.push({
        baseRumEvent: deepClone(baseRumEvent),
        historyEntry,
        eventId,
        final,
        baggage,
      })
      if (pendingAssemblies.length > PENDING_ASSEMBLIES_LIMIT) {
        // Drop the oldest
        pendingAssemblies.shift()
      }
      return
    }
    assembleRumEvent(pipeline, { baseRumEvent, historyEntry, eventId, final, baggage })
  }

  // Called when the session manager resolves and when a view is started: buffered assemblies may
  // have become ready. Assemblies that are still not ready (ex: no view covers their start time
  // yet) stay buffered.
  function tryFlushPendingAssemblies() {
    if (!sessionManager) {
      return
    }
    const stillPending: PendingAssembly[] = []
    // Detach the buffer first: assemblies collected while flushing (ex: from notification
    // subscribers) are buffered for the next flush instead of iterating a mutating array.
    const toAssemble = pendingAssemblies.splice(0, pendingAssemblies.length)
    for (const pending of toAssemble) {
      if (isAssemblyReady(pending.baseRumEvent, pending.baggage.startClocks.relative)) {
        assembleRumEvent(pipeline, pending)
      } else {
        stillPending.push(pending)
      }
    }
    pendingAssemblies.unshift(...stillPending)
  }

  //
  // Other public methods
  //

  function registerHook(callback: AssembleHookCallback) {
    const { unregister } = assembleHook.register(callback)
    return {
      stop: unregister,
    }
  }

  function findEvents(query: FindEventsQuery): RumEventHistoryEntry[] {
    return history.findEvents(query)
  }

  function findSession(startTime?: RelativeTime): SessionContext | undefined {
    return sessionManager?.findSession(startTime)
  }

  function stopApi() {
    stopped = true
    sessionSubscriptions.forEach((unsubscribe) => unsubscribe())
    sessionSubscriptions = []
    history.clear()
    pendingAssemblies.length = 0
  }

  //
  // Misuse guards
  //

  function assertNotStopped() {
    if (stopped) {
      throw new Error('The internal API has been stopped.')
    }
  }
}
