// PoC phase 5 validation (see /plan.md): the profiler on the internal API — the big lines.
// Replaces the 1484-line LifeCycle-based spec of the old architecture (deleted with it):
// the remaining coverage lives here (profiles carry events from `findEvents`, view entries from
// `event_started`, session expiry / renewal via notifications) and in the untouched specs
// (quotaCheck, transport, debug ids, view name utils).

import { clocksNow, relativeNow, relativeToClocks } from '@datadog/js-core/time'
import type { Duration, RelativeTime } from '@datadog/js-core/time'
import { deepClone } from '@datadog/js-core/util'

import { createIdentityEncoder } from '@datadog/browser-core'
import { createSessionManagerMock, mockClock, waitNextMicrotask, replaceMockable } from '@datadog/browser-core/test'
import { createRumInternalApi, RumLongTaskEntryType, RumPerformanceEntryType } from '@datadog/browser-rum-core'
import type { RumInternalApi } from '@datadog/browser-rum-core'
import { mockRumConfiguration } from '../../../../browser-rum-core/test'
import { mockProfiler } from '../../../test'
import type { BrowserProfilerTrace } from '../../types'
import { checkProfilingQuota } from './quotaCheck'
import { mockedTrace } from './test-utils/mockedTrace'
import { createRumProfiler } from './datadogProfiler'
import { createFormDataEmitter } from './transport/formDataEmitter'
import type { ProfilingContextManager } from './profilingContext'
import { startProfilingContext } from './profilingContext'

describe('profiler (internal api PoC)', () => {
  let emitPayloadSpy: jasmine.Spy

  function setupProfiler() {
    const sessionManager = createSessionManagerMock().setId('session-id-1')
    const internalApi = createRumInternalApi({ sessionManager })
    const profilingContextManager: ProfilingContextManager = startProfilingContext(internalApi)

    // A view is needed for child events (long tasks, actions, vitals) to be assembled and
    // findable in the history. Its name exercises the default view name computation.
    history.pushState({}, '', '/user/123')
    const firstViewHandle = internalApi.startEvent({ type: 'view', view: { url: location.href, name: 'user view' } })
    firstViewHandle.update({})
    const firstViewHandleRef = firstViewHandle // captured for view-replacement tests

    mockProfiler(deepClone(mockedTrace))

    emitPayloadSpy = jasmine.createSpy('emitPayload')
    replaceMockable(createFormDataEmitter, () => emitPayloadSpy)

    const profiler = createRumProfiler(
      internalApi,
      mockRumConfiguration({ profilingSampleRate: 100 }),
      sessionManager,
      profilingContextManager,
      createIdentityEncoder
    )

    return { profiler, profilingContextManager, internalApi, sessionManager, firstViewHandle: firstViewHandleRef }
  }

  function addLongTask(internalApi: RumInternalApi, _id: string, startClocks = clocksNow()) {
    internalApi.addEvent({
      baseRumEvent: {
        type: 'long_task',
        long_task: { duration: 100 as never, entry_type: RumLongTaskEntryType.LONG_TASK },
      },
      baggage: { startClocks, duration: 100 as Duration },
    })
  }

  function addAction(internalApi: RumInternalApi, _id: string, name: string) {
    internalApi.addEvent({
      baseRumEvent: { type: 'action', action: { type: 'custom', target: { name } } },
      baggage: { startClocks: clocksNow() },
    })
  }

  function addVital(internalApi: RumInternalApi, id: string, name: string) {
    internalApi.addEvent({
      baseRumEvent: { type: 'vital', vital: { id, name, type: 'duration', duration: 100 } },
      baggage: { startClocks: clocksNow(), duration: 100 as Duration },
    })
  }

  // The event ids collected through event_collected, by event type (the internal API owns the
  // ids, so tests assert on these instead of the caller-provided ones)
  function collectCollectedEventIds(internalApi: RumInternalApi) {
    const ids: Record<string, string[]> = { long_task: [], action: [], vital: [] }
    internalApi.notifications.subscribe((notification) => {
      if (notification.type === 'event_collected') {
        const event = notification.event as {
          type: string
          long_task?: { id: string }
          action?: { id: string }
          vital?: { id: string }
        }
        const id = event.long_task?.id ?? event.action?.id ?? event.vital?.id
        if (id && event.type in ids) {
          ids[event.type].push(id)
        }
      }
    })
    return ids
  }

  it('collects long tasks, actions and vitals happening during a profiling session', async () => {
    const clock = mockClock()
    const { profiler, internalApi } = setupProfiler()
    replaceMockable(checkProfilingQuota, () => Promise.resolve({ decision: 'quota_ok' } as never)) // quota check is irrelevant here

    const collectedIds = collectCollectedEventIds(internalApi)

    profiler.start()
    expect(profiler.isRunning()).toBeTrue()

    addLongTask(internalApi, 'long-task-id-1')
    addAction(internalApi, 'action-id-1', 'action name 1')
    addVital(internalApi, 'vital-id-1', 'vital name 1')

    // A long task outside the profile window (before it started) must not be included
    addLongTask(internalApi, 'long-task-id-outside', relativeToClocks((relativeNow() - 10000) as RelativeTime))

    clock.tick(6000) // above the minimum profile duration
    profiler.stop()
    expect(profiler.isStopped()).toBeTrue()

    // Data collection uses promises (microtasks)
    await waitNextMicrotask()
    await waitNextMicrotask()

    expect(emitPayloadSpy).toHaveBeenCalled()
    const trace: BrowserProfilerTrace = emitPayloadSpy.calls.argsFor(0)[0].trace

    // The event ids are owned by the internal API (caller-provided ones are overwritten), so
    // assert on the ids collected through event_collected
    expect(trace.longTasks.length).toBe(1)
    expect(trace.longTasks[0].id).toBe(collectedIds.long_task[0])
    expect(trace.longTasks[0].duration).toBe(100)
    expect(trace.longTasks[0].entryType).toBe(RumPerformanceEntryType.LONG_TASK)

    expect(trace.actions!.length).toBe(1)
    expect(trace.actions![0].id).toBe(collectedIds.action[0])
    expect(trace.actions![0].label).toBe('action name 1')

    expect(trace.vitals!.length).toBe(1)
    expect(trace.vitals![0].id).toBe(collectedIds.vital[0])
    expect(trace.vitals![0].label).toBe('vital name 1')
    expect(trace.vitals![0].duration).toBe(100)
  })

  it('collects the active view at start and views started during the session', async () => {
    const clock = mockClock()
    const { profiler, internalApi, firstViewHandle } = setupProfiler()
    replaceMockable(checkProfilingQuota, () => Promise.resolve({ decision: 'quota_ok' } as never))

    profiler.start()
    expect(profiler.isRunning()).toBeTrue()

    // A view started during the profile: its name goes through the default view name computation
    // (event_started carries only the event id, the name is resolved from the history). The
    // previous view is stopped first (router semantics: throw-on-double-view).
    history.pushState({}, '', '/v1/user/3A2/profile')
    firstViewHandle.stop(undefined, { endClocks: clocksNow() })
    internalApi.startEvent({ type: 'view', view: { url: location.href } }).update({})

    clock.tick(6000)
    profiler.stop()

    await waitNextMicrotask()
    await waitNextMicrotask()

    const views: BrowserProfilerTrace['views'] = emitPayloadSpy.calls.argsFor(0)[0].trace.views
    expect(views.length).toBe(2)
    // The view active at profiler start
    expect(views[0].viewName).toBe('user view')
    // The view started during the profile: no custom name, so the default view name is computed
    expect(views[1].viewName).toBe('/v1/user/?/profile')
  })

  it('stops profiling when the session expires and restarts on renewal', async () => {
    const clock = mockClock()
    const { profiler, profilingContextManager, sessionManager } = setupProfiler()
    replaceMockable(checkProfilingQuota, () => Promise.resolve({ decision: 'quota_ok' } as never))

    profiler.start()
    expect(profiler.isRunning()).toBeTrue()
    expect(profilingContextManager.get()?.status).toBe('running')

    clock.tick(6000)
    // Session expiry (the session stays tracked for the renewal below — the mock cannot
    // reactivate a session, and the restart logic needs a tracked session)
    sessionManager.expireObservable.notify()

    expect(profiler.isStopped()).toBeTrue()
    expect(profilingContextManager.get()?.status).toBe('stopped')

    await waitNextMicrotask()
    await waitNextMicrotask()
    expect(emitPayloadSpy.calls.count()).toBe(1)

    // The session renews: the profiler restarts (the new session is still sampled)
    sessionManager.renewObservable.notify()

    expect(profiler.isRunning()).toBeTrue()

    clock.tick(6000)
    profiler.stop()
    await waitNextMicrotask()
    await waitNextMicrotask()
    expect(emitPayloadSpy.calls.count()).toBe(2)
  })

  it('does not restart profiling on session renewal if the profiler was stopped by the user', () => {
    const clock = mockClock()
    const { profiler, sessionManager } = setupProfiler()
    replaceMockable(checkProfilingQuota, () => Promise.resolve({ decision: 'quota_ok' } as never))

    profiler.start()
    clock.tick(6000)
    profiler.stop()
    expect(profiler.isStopped()).toBeTrue()

    sessionManager.renewObservable.notify()

    expect(profiler.isStopped()).toBeTrue()
  })

  it('discards profiles below the duration threshold when no long task happened', async () => {
    const clock = mockClock()
    const { profiler } = setupProfiler()
    replaceMockable(checkProfilingQuota, () => Promise.resolve({ decision: 'quota_ok' } as never))

    profiler.start()
    clock.tick(1000) // below minProfileDurationMs (5s)
    profiler.stop()

    await waitNextMicrotask()
    await waitNextMicrotask()

    expect(emitPayloadSpy).not.toHaveBeenCalled()
  })
})
