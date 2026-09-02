// PoC implementation of the RUM internal API ("thin layer"), described in
// /rum-thin-layer.ts and crash-tested per /plan.md (phase 1).
//
// This module is the orchestrator: it owns the session manager resolution, the assembly
// buffering and the event handles. The other pieces live in the sibling modules: the public
// types (rumInternalApi.types.ts), the draft event helpers (baseRumEvent.ts), the event history
// (eventHistory.ts) and the assembly pipeline (assembleRumEvent.ts).
//
// PoC notes / deviations from the current RUM behavior:
// * Events collected before the session manager resolves (ex: while tracking consent is not
//   granted yet) or before a view covers their start time (ex: before the initial view is
//   started, as preStartRum buffers calls collected before RUM starts) are assembled and
//   notified when they become ready, instead of being assembled on the spot. Events no view ever
//   covers stay buffered (bounded), never sent.
// * Rate limit reach is not surfaced to customers yet (today it reports an error event): wiring
//   that is deferred to a later phase of the PoC.
// * `ddtags` (built from the configuration) are not added to events: the configuration is out of
//   scope.
// * View events are exempt from rate limiting and cannot be dismissed by `beforeSend`, as today.

import type { ClocksState, RelativeTime } from '@datadog/js-core/time'
import { addDuration, clocksNow, elapsed } from '@datadog/js-core/time'
import { createHook } from '@datadog/js-core/assembly'
import { deepClone, mergeInto } from '@datadog/js-core/util'
import type { Context, EventRateLimiter, SessionContext, SessionManager } from '@datadog/browser-core'
import { Observable, createEventRateLimiter, generateUUID, monitorError, noop } from '@datadog/browser-core'
import { assertKickoffFields, stampEventId } from './baseRumEvent'
import type { DraftEvent } from './baseRumEvent'
import { createEventHistory } from './eventHistory'
import type { InternalHistoryEntry } from './eventHistory'
import { assembleRumEvent } from './assembleRumEvent'
import type { AssemblyPipeline, PendingAssembly } from './assembleRumEvent'
import type {
  AddEventOptions,
  AssembleHookCallback,
  AssembleHookParams,
  EventBaggage,
  FindEventsQuery,
  IncompleteBaseRumEvent,
  InternalRumEventType,
  RumEventHistoryEntry,
  RumInternalApi,
  RumInternalApiOptions,
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

// The runtime shape of the event handle, before the per-event-type constraint is applied
interface InternalEventHandle {
  cancel(): void
  update(baseRumEvent: Context): void
  stop(baseRumEvent?: Context, options?: { endClocks?: ClocksState }): void
}

export function createRumInternalApi(options: RumInternalApiOptions): RumInternalApi {
  const assembleHook = createHook<AssembleHookParams, Context>()
  const notificationsObservable = new Observable<RumInternalNotification>()
  const history = createEventHistory()
  const rateLimiters: Partial<Record<InternalRumEventType, EventRateLimiter>> = {
    // Rate limit reach is not surfaced to customers yet (see the PoC notes at the top of this file)
    error: createEventRateLimiter('error', noop, options.eventRateLimit),
    action: createEventRateLimiter('action', noop, options.eventRateLimit),
    vital: createEventRateLimiter('vital', noop, options.eventRateLimit),
  }
  const pipeline: AssemblyPipeline = {
    history,
    assembleHook,
    rateLimiters,
    beforeSend: options.beforeSend,
    notifications: notificationsObservable,
  }
  let sessionManager: SessionManager | undefined
  let sessionSubscriptions: Array<() => void> = []
  const pendingAssemblies: PendingAssembly[] = []
  let stopped = false

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

  return {
    startEvent,
    addEvent,
    registerHook,
    get notifications() {
      return notificationsObservable
    },
    findEvents,
    findSession,
    stop: stopApi,
  }

  //
  // Public API
  //

  function startEvent(
    startOptions: IncompleteBaseRumEvent & { type: StartableRumEventType },
    startBaggage?: Partial<EventBaggage>
  ): InternalEventHandle {
    assertNotStopped()
    if (!STARTABLE_EVENT_TYPES.includes(startOptions.type)) {
      throw new Error(`Cannot start a '${startOptions.type}' event.`)
    }
    if (startOptions.type === 'view' && history.findViewAt(clocksNow().relative)) {
      throw new Error('A view is already active. Stop the current view before starting a new one.')
    }

    const eventId = generateUUID()
    const baggage: EventBaggage = { ...startBaggage, startClocks: startBaggage?.startClocks ?? clocksNow() }
    // The start options are (a partial of) the base event: the same event shape flows through
    // startEvent(), update() and stop(). Cloned so caller-side mutations don't leak into the
    // event being built.
    const currentBase: IncompleteBaseRumEvent & { type: StartableRumEventType } = deepClone(startOptions)
    // Stamp the event id owned by the internal API, so history entries expose it from the start
    // (ex: Replay reads the current view id)
    stampEventId(currentBase, eventId)
    if (startOptions.type === 'view') {
      history.initViewEntry(eventId)
    } else if (startOptions.type === 'action') {
      history.initActionEntry(eventId)
    }

    // The entry references the live draft: update() / stop() merges are reflected on it.
    const historyEntry = history.addEntry(
      { complete: false, event: currentBase, baggage },
      baggage.startClocks.relative,
      eventId
    )

    // Notified synchronously, before any assembly, and never buffered: Replay takes full
    // snapshots on view start, before any DOM mutation, and needs the view id immediately.
    notificationsObservable.notify({
      type: 'event_started',
      eventType: startOptions.type,
      eventId,
      baggage,
    })

    if (startOptions.type === 'view') {
      // The new view may cover buffered events (ex: the initial view starts at the clock origin,
      // covering events collected before it was created).
      tryFlushPendingAssemblies()
    }

    let finished = false

    function assertNotFinished() {
      if (finished) {
        throw new Error('The event has already been stopped or cancelled.')
      }
    }

    const internalHandle: InternalEventHandle = {
      update(partial) {
        assertNotFinished()
        if (startOptions.type !== 'view') {
          throw new Error('Only views can be updated. Other events pass stop-side values to stop().')
        }
        mergeInto(currentBase, partial)
        assembleAndNotify({
          baseRumEvent: currentBase,
          historyEntry,
          eventId,
          final: false,
          baggage: { ...baggage, duration: undefined },
        })
      },

      stop(partial, stopOptions) {
        assertNotFinished()
        mergeInto(currentBase, partial)
        assertKickoffFields(currentBase)
        const endClocks = stopOptions?.endClocks ?? clocksNow()
        history.closeEntry(historyEntry, endClocks.relative)
        if (startOptions.type === 'action') {
          history.deleteActionEntry(eventId)
        }
        finished = true
        assembleAndNotify({
          baseRumEvent: currentBase,
          historyEntry,
          eventId,
          final: true,
          baggage: { ...baggage, duration: elapsed(baggage.startClocks.timeStamp, endClocks.timeStamp) },
        })
      },

      cancel() {
        assertNotFinished()
        if (startOptions.type === 'view') {
          throw new Error('Views cannot be cancelled. Stop the current view instead.')
        }
        history.removeEntry(historyEntry)
        if (startOptions.type === 'action') {
          history.deleteActionEntry(eventId)
        }
        finished = true
      },
    }
    // The internal handle carries all methods: the type-level constraints (update restricted to
    // views, kickoff fields required by stop) are enforced at runtime, and exposed through the
    // RumInternalApi.startEvent overloads.
    return internalHandle
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
    const baseEvent = deepClone(addOptions.baseRumEvent)
    stampEventId(baseEvent, eventId)
    const historyEntry = history.addEntry(
      { complete: false, event: baseEvent, baggage },
      baggage.startClocks.relative,
      eventId
    )
    if (baggage.duration !== undefined) {
      history.closeEntry(historyEntry, addDuration(baggage.startClocks.relative, baggage.duration))
    }
    assembleAndNotify({ baseRumEvent: baseEvent, historyEntry, eventId, final: true, baggage })
  }

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
  // Session manager
  //

  function setSessionManager(newSessionManager: SessionManager) {
    sessionManager = newSessionManager
    const renewSubscription = sessionManager.renewObservable.subscribe(() =>
      notificationsObservable.notify({ type: 'session_renewed' })
    )
    const expireSubscription = sessionManager.expireObservable.subscribe(() =>
      notificationsObservable.notify({ type: 'session_expired' })
    )
    sessionSubscriptions.push(
      () => renewSubscription.unsubscribe(),
      () => expireSubscription.unsubscribe()
    )
    tryFlushPendingAssemblies()
  }

  //
  // Assembly
  //

  // An assembly is ready when the session manager has resolved and a view covers the event start
  // time (views cover themselves: they are the root of the event hierarchy). Views usually start
  // at the clock origin, so the initial view covers events collected before it was created, as
  // preStartRum buffers calls collected before RUM starts.
  function isAssemblyReady(baseRumEvent: DraftEvent, startTime: RelativeTime): boolean {
    if (!sessionManager) {
      return false
    }
    return baseRumEvent.type === 'view' || history.findViewAt(startTime) !== undefined
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
  // have become ready. Assemblies that are still not ready (no view covers their start time yet)
  // stay buffered.
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
  // Misuse guards
  //

  function assertNotStopped() {
    if (stopped) {
      throw new Error('The internal API has been stopped.')
    }
  }
}
