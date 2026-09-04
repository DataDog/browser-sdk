// PoC v2 implementation of the RUM internal API ("thin layer"), described in /rum-thin-layer.ts
// and plan-v2.md. This module is the orchestrator: it owns the configuration binding, the
// assembly buffering and the view state machine. The other pieces live in the sibling modules:
// the public types (rumInternalApi.types.ts), the draft event helpers (baseRumEvent.ts), the
// event history (eventHistory.ts) and the assembly pipeline (assembleRumEvent.ts).
//
// v2 state machines, in short:
// * Configuration: the API is created eagerly (unconfigured). configure() binds the validated
//   configuration (beforeSend, rate limits, session manager promise) — assemblies collected
//   before it are held, exactly like events collected before the session manager resolves. If
//   configure never happens, nothing is ever assembled: RUM does not start.
// * Views: a DRAFT view exists from creation (id pre-assigned, history entry at the clock
//   origin, update()-accepting). The first startEvent({type:'view'}) promotes it (kickoff wins
//   over buffered updates, initial version emitted). A view startEvent while a view is active
//   SUPERSEDES it (previous activity closes at the new start, final version assembled). Views
//   are never stopped by callers; session expiry endings are owned by the API (see
//   onSessionExpired for the ordering contract).
//
// PoC notes / deviations from the current RUM behavior (v1 list, still true):
// * Rate limit reach is not surfaced to customers yet (today it reports an error event): wiring
//   that is deferred to a later phase of the PoC.
// * `ddtags` (built from the configuration) are not added to events: the configuration is out
//   of scope.
// * View events are exempt from rate limiting and cannot be dismissed by `beforeSend`, as today.

import type { ClocksState, Duration, RelativeTime } from '@datadog/js-core/time'
import { addDuration, clocksNow, clocksOrigin, elapsed, toServerDuration } from '@datadog/js-core/time'
import { createHook } from '@datadog/js-core/assembly'
import { deepClone, mergeInto } from '@datadog/js-core/util'
import type { Context, EventRateLimiter, SessionContext, SessionManager } from '@datadog/browser-core'
import { Observable, createEventRateLimiter, generateUUID, monitorError, noop } from '@datadog/browser-core'
import { ViewLoadingType } from '../../rawRumEvent.types'
import { assertKickoffFields, stampEventId } from './baseRumEvent'
import type { DraftEvent } from './baseRumEvent'
import { createEventHistory } from './eventHistory'
import type { InternalHistoryEntry } from './eventHistory'
import { assembleRumEvent } from './assembleRumEvent'
import type { AssemblyPipeline, PendingAssembly } from './assembleRumEvent'
import type {
  AddEventOptions,
  AssembleHookCallback,
  BaseRumEvent,
  AssembleHookParams,
  BeforeSend,
  ConfigureOptions,
  EventBaggage,
  FindEventsQuery,
  IncompleteBaseRumEvent,
  InternalRumEventType,
  NonViewEventHandle,
  RumEventHistoryEntry,
  RumInternalApi,
  RumInternalNotification,
  StartableRumEventType,
  ViewEventHandle,
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

// The state of the current (or draft) view. The public ViewEventHandle closes over one of
// these: updates go through the state even once the view is no longer current, and throw once
// the view has been ended.
interface ViewState {
  eventId: string
  // The view event being built: the live object `update()` merges into.
  base: DraftEvent
  baggage: EventBaggage
  historyEntry: InternalHistoryEntry
  handle: ViewEventHandle
  // false for the draft, until promotion. View assemblies are held while false.
  started: boolean
  // Set at supersede / expiry — the activity window end. Set views reject updates.
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

  // The draft view: created at API creation, promoted by the first view startEvent. Early view
  // mutations (ex: public API setViewName before init()) land on it and buffer for free.
  let currentView = createDraftView()

  return {
    startEvent,
    addEvent,
    registerHook,
    configure,
    get currentView() {
      assertNotStopped()
      return currentView.handle
    },
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

  // The draft: an incomplete view event (no url yet — the promotion kickoff provides it) with a
  // pre-assigned id, in the history from the clock origin (visible in findEvents, covering nothing
  // until promoted: findViewAt skips un-started views).
  function createDraftView(): ViewState {
    const eventId = generateUUID()
    const base = { type: 'view' } as DraftEvent
    const baggage: EventBaggage = { startClocks: clocksOrigin() }
    stampEventId(base, eventId)
    history.initViewEntry(eventId)
    const historyEntry = history.addEntry(
      { complete: false, event: base, baggage },
      baggage.startClocks.relative,
      eventId
    )
    history.markViewUnstarted(eventId)
    const view: ViewState = {
      eventId,
      base,
      baggage,
      historyEntry,
      handle: undefined as unknown as ViewEventHandle,
      started: false,
      endedClocks: undefined,
    }
    view.handle = createViewHandle(view)
    return view
  }

  function createStartedView(
    kickoff: IncompleteBaseRumEvent & { type: 'view' } & Context,
    startBaggage?: Partial<EventBaggage>
  ): ViewState {
    const startClocks = startBaggage?.startClocks ?? clocksNow()
    const eventId = generateUUID()
    const base = deepClone(kickoff) as DraftEvent
    stampEventId(base, eventId)
    history.initViewEntry(eventId)
    const baggage: EventBaggage = { ...startBaggage, startClocks }
    const historyEntry = history.addEntry({ complete: false, event: base, baggage }, startClocks.relative, eventId)
    const view: ViewState = {
      eventId,
      base,
      baggage,
      historyEntry,
      handle: undefined as unknown as ViewEventHandle,
      started: true,
      endedClocks: undefined,
    }
    view.handle = createViewHandle(view)
    return view
  }

  function createViewHandle(view: ViewState): ViewEventHandle {
    return {
      current: () => view.historyEntry.value,
      update(partial) {
        assertNotStopped()
        if (view.endedClocks !== undefined) {
          throw new Error('The view has already been ended (superseded or expired).')
        }
        mergeInto(view.base, partial)
        // Draft updates are held by the assembly rules (isAssemblyReady), so the merge buffers
        // as part of the eventual kickoff state.
        assembleViewState(view, { final: false })
      },
    }
  }

  // Public dispatcher: the overloads below mirror the RumInternalApi interface (the view one
  // requires a complete kickoff at the type level; the runtime promotion check is a defense
  // since the draft is what gets promoted). The implementation signature routes views to the
  // state machine above and the rest to the start/stop pair below, keeping the runtime misuse
  // guards.
  function startEvent(
    options: Extract<BaseRumEvent, { type: 'view' }>,
    baggage?: Partial<EventBaggage>
  ): ViewEventHandle
  function startEvent(
    options: IncompleteBaseRumEvent & { type: 'action' },
    baggage?: Partial<EventBaggage>
  ): NonViewEventHandle<'action'>
  function startEvent(
    options: IncompleteBaseRumEvent & { type: 'resource' },
    baggage?: Partial<EventBaggage>
  ): NonViewEventHandle<'resource'>
  function startEvent(
    options: IncompleteBaseRumEvent & { type: 'vital' },
    baggage?: Partial<EventBaggage>
  ): NonViewEventHandle<'vital'>
  function startEvent(
    startOptions: IncompleteBaseRumEvent & { type: StartableRumEventType },
    startBaggage?: Partial<EventBaggage>
  ): ViewEventHandle | NonViewEventHandle<'action' | 'resource' | 'vital'> {
    assertNotStopped()
    if (!STARTABLE_EVENT_TYPES.includes(startOptions.type)) {
      throw new Error(`Cannot start a '${startOptions.type}' event.`)
    }
    if (startOptions.type === 'view') {
      return startView(startOptions, startBaggage)
    }
    return startNonViewEvent(startOptions, startBaggage)
  }

  function startView(
    kickoff: IncompleteBaseRumEvent & { type: 'view' } & Context,
    startBaggage?: Partial<EventBaggage>
  ): ViewEventHandle {
    assertNotStopped()
    if (!currentView.started) {
      return promoteDraft(kickoff, startBaggage)
    }
    if (currentView.endedClocks === undefined) {
      return supersedeView(kickoff, startBaggage)
    }
    // The previous view already ended (session expiry): plain start, nothing to supersede.
    const newView = createStartedView(kickoff, startBaggage)
    currentView = newView
    notifyEventStarted(newView)
    assembleViewState(newView, { final: false })
    tryFlushPendingAssemblies()
    return newView.handle
  }

  // Promote the draft: the kickoff wins over buffered draft updates, the start stays at the
  // clock origin (fixed at draft creation, no matter when the promotion happens) and the loading
  // type is always initial_load. `event_started` fires and the initial version is assembled.
  function promoteDraft(
    kickoff: IncompleteBaseRumEvent & { type: 'view' } & Context,
    startBaggage?: Partial<EventBaggage>
  ): ViewEventHandle {
    const view = currentView
    mergeInto(view.base, kickoff)
    if ((view.base.view as { url?: string } | undefined)?.url === undefined) {
      throw new Error("Missing kickoff field 'view.url': the draft cannot be promoted without it.")
    }
    // Stamped after the kickoff merge, so the initial view is always an initial_load (decision:
    // no kickoff can override it).
    mergeInto(view.base, { view: { loading_type: ViewLoadingType.INITIAL_LOAD } })
    mergeInto(view.baggage, { domainContext: startBaggage?.domainContext })
    view.started = true
    history.markViewStarted(view.eventId)
    // Drop the draft's held update assemblies: they are stale clones (snapshots of the base at
    // update time), and their merged content is already part of the promoted base — the initial
    // version below is fresher than any of them. Replaying them after it would make a stale
    // snapshot the latest document version (found by the phase A unit specs).
    dropPendingAssemblies(view.eventId)
    notifyEventStarted(view)
    // The initial view version is emitted by the API (no update({}) dance in consumers)
    assembleViewState(view, { final: false })
    // Child events collected before promotion are now covered (the view starts at the clock
    // origin): their held assemblies may be ready.
    tryFlushPendingAssemblies()
    return view.handle
  }

  // Supersede: the previous view's activity window closes at the new view's start (end-exclusive:
  // events at that instant belong to the new view) and its final version is assembled by the API.
  // `event_started` fires before any assembly (Replay takes full snapshots on view start).
  function supersedeView(
    kickoff: IncompleteBaseRumEvent & { type: 'view' } & Context,
    startBaggage?: Partial<EventBaggage>
  ): ViewEventHandle {
    const superseded = currentView
    const newView = createStartedView(kickoff, startBaggage)
    endView(superseded, newView.baggage.startClocks)
    currentView = newView
    notifyEventStarted(newView)
    assembleViewState(superseded, { final: true })
    assembleViewState(newView, { final: false })
    tryFlushPendingAssemblies()
    return newView.handle
  }

  // Session expiry: the last-update slot is the synchronous `session_expired` notify — consumers
  // may update the current view during it. Once it returns, the API ends the view and assembles
  // its final version, BEFORE any consumer can react (the transport subscribes the session
  // expiry flush after this API, see configure): the final version is upserted in the batch
  // before it flushes, structurally.
  function onSessionExpired() {
    notificationsObservable.notify({ type: 'session_expired' })
    if (currentView.started && currentView.endedClocks === undefined) {
      endView(currentView, clocksNow())
      assembleViewState(currentView, { final: true })
    }
  }

  // Close the view's activity window. The final version (is_active false, time_spent derived
  // from the activity bounds) is assembled separately, so notification ordering stays explicit.
  function endView(view: ViewState, endClocks: ClocksState) {
    history.closeEntry(view.historyEntry, endClocks.relative)
    view.endedClocks = endClocks
  }

  // Assemble a view version. The API owns the view lifecycle fields: is_active on every version,
  // time_spent on the final one (derived — that is why views don't need a stop()).
  function assembleViewState(view: ViewState, options: { final: boolean }) {
    if (options.final) {
      const endClocks = view.endedClocks
      if (endClocks === undefined) {
        throw new Error('The final version of a view is assembled by the API only (supersede / expiry).')
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
  ): NonViewEventHandle<'action' | 'resource' | 'vital'> {
    const startClocks = startBaggage?.startClocks ?? clocksNow()
    const eventId = generateUUID()
    // The start options are (a partial of) the base event: the same event shape flows through
    // startEvent() and stop(). Cloned so caller-side mutations don't leak into the event being
    // built, and stamped with the id owned by the internal API, so history entries expose it from
    // the start.
    const base = deepClone(startOptions) as DraftEvent
    stampEventId(base, eventId)
    const baggage: EventBaggage = { ...startBaggage, startClocks }
    if (startOptions.type === 'action') {
      history.initActionEntry(eventId)
    }
    const historyEntry = history.addEntry({ complete: false, event: base, baggage }, startClocks.relative, eventId)
    notificationsObservable.notify({
      type: 'event_started',
      eventType: startOptions.type,
      eventId,
      event: base as IncompleteBaseRumEvent,
      baggage,
    })
    let finished = false

    function assertNotFinished() {
      if (finished) {
        throw new Error('The event has already been stopped or cancelled.')
      }
    }

    // The handle carries all methods: the type-level constraints (kickoff fields required by
    // stop) are enforced at runtime, and exposed through the RumInternalApi.startEvent
    // overloads.
    const handle = {
      current: () => historyEntry.value,
      cancel() {
        assertNotStopped()
        assertNotFinished()
        history.removeEntry(historyEntry)
        if (startOptions.type === 'action') {
          history.deleteActionEntry(eventId)
        }
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
        // The action child counts must still be in the map when the final assembly snapshots
        // them onto the event (deleting before assembling zeroed them — bug found in 3b review)
        if (startOptions.type === 'action') {
          history.deleteActionEntry(eventId)
        }
      },
    }
    return handle as NonViewEventHandle<'action' | 'resource' | 'vital'>
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

  // An assembly is ready when the API is configured, the session manager has resolved, and:
  // * for views: the view is started (draft updates wait for promotion — superseded views still
  //   assemble their final version after their activity window closed, so the coverage lookup is
  //   not used for them),
  // * for other events: a started view covers the event start time.
  function isAssemblyReady(baseRumEvent: DraftEvent, eventId: string, startTime: RelativeTime): boolean {
    if (!sessionManager) {
      // Covers unconfigured too: the session manager is only set by configure()
      return false
    }
    if (baseRumEvent.type === 'view') {
      return history.isViewStarted(eventId)
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
    if (!isAssemblyReady(baseRumEvent, eventId, baggage.startClocks.relative)) {
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
      if (isAssemblyReady(pending.baseRumEvent, pending.eventId, pending.baggage.startClocks.relative)) {
        assembleRumEvent(pipeline, pending)
      } else {
        stillPending.push(pending)
      }
    }
    pendingAssemblies.unshift(...stillPending)
  }

  function dropPendingAssemblies(eventId: string) {
    for (let i = pendingAssemblies.length - 1; i >= 0; i--) {
      if (pendingAssemblies[i].eventId === eventId) {
        pendingAssemblies.splice(i, 1)
      }
    }
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
