import type { ViewHistoryEntry } from '@datadog/browser-rum-core'
import { LifeCycle, LifeCycleEventType, RumPerformanceEntryType, createHooks } from '@datadog/browser-rum-core'
import type { Duration } from '@datadog/browser-core'
import {
  addDuration,
  clocksNow,
  clocksOrigin,
  createIdentityEncoder,
  createValueHistory,
  deepClone,
  ONE_DAY,
  relativeNow,
  timeStampNow,
} from '@datadog/browser-core'
import {
  setPageVisibility,
  restorePageVisibility,
  createNewEvent,
  interceptRequests,
  DEFAULT_FETCH_MOCK,
  readFormDataRequest,
  mockClock,
  waitNextMicrotask,
  replaceMockable,
} from '@datadog/browser-core/test'
import { createRumSessionManagerMock, mockRumConfiguration, mockViewHistory } from '../../../../rum-core/test'
import { mockProfiler } from '../../../test'
import type { BrowserProfilerTrace } from '../../types'
import { mockedTrace } from './test-utils/mockedTrace'
import { createRumProfiler } from './profiler'
import type { ProfilerTrace } from './types'
import type { ProfilingContextManager } from './profilingContext'
import { startProfilingContext } from './profilingContext'
import type { ProfileEventPayload } from './transport/assembly'
import { createLongTaskHistory, type LongTaskContext } from './longTaskHistory'

describe('profiler', () => {
  // Store the original pathname
  const originalPathname = document.location.pathname
  let interceptor: ReturnType<typeof interceptRequests>

  beforeEach(() => {
    interceptor = interceptRequests()
    interceptor.withFetch(DEFAULT_FETCH_MOCK, DEFAULT_FETCH_MOCK, DEFAULT_FETCH_MOCK)
  })

  afterEach(() => {
    restorePageVisibility()
    // Go back to the original pathname
    history.pushState({}, '', originalPathname)
  })

  let lifeCycle = new LifeCycle()

  function setupProfiler(currentView?: ViewHistoryEntry) {
    const sessionManager = createRumSessionManagerMock().setId('session-id-1')
    lifeCycle = new LifeCycle()
    const hooks = createHooks()
    const profilingContextManager: ProfilingContextManager = startProfilingContext(hooks)

    const mockProfilerTrace: ProfilerTrace = deepClone(mockedTrace)

    const mockedRumProfilerTrace: BrowserProfilerTrace = Object.assign(mockProfilerTrace, {
      startClocks: {
        relative: relativeNow(),
        timeStamp: timeStampNow(),
      },
      endClocks: {
        relative: relativeNow(),
        timeStamp: timeStampNow(),
      },
      clocksOrigin: clocksOrigin(),
      sampleInterval: 10,
      longTasks: [],
      views: [],
    })

    const viewHistory = mockViewHistory(
      currentView ?? {
        id: 'view-id-1',
        name: 'view-name-1',
        startClocks: {
          relative: relativeNow(),
          timeStamp: timeStampNow(),
        },
      }
    )

    // Replace Browser's Profiler with a mock for testing purpose.
    mockProfiler(mockProfilerTrace)

    const longTaskHistory = createValueHistory<LongTaskContext>({
      expireDelay: ONE_DAY,
    })
    replaceMockable(createLongTaskHistory, () => longTaskHistory)

    // Start collection of profile.
    const profiler = createRumProfiler(
      mockRumConfiguration({ trackLongTasks: true, profilingSampleRate: 100 }),
      lifeCycle,
      sessionManager,
      profilingContextManager,
      createIdentityEncoder,
      viewHistory,
      // Overrides default configuration for testing purpose.
      {
        sampleIntervalMs: 10,
        collectIntervalMs: 60000, // 1min
        minNumberOfSamples: 0,
        minProfileDurationMs: 0,
      }
    )
    return {
      profiler,
      profilingContextManager,
      mockedRumProfilerTrace,
      addLongTask: (longTask: LongTaskContext) => {
        longTaskHistory.add(longTask, relativeNow()).close(addDuration(relativeNow(), longTask.duration))
      },
    }
  }

  it('should start profiling collection and collect data on stop', async () => {
    const { profiler, profilingContextManager, mockedRumProfilerTrace } = setupProfiler()

    expect(profilingContextManager.get()?.status).toBe('starting')

    profiler.start()

    // Wait for start of collection.
    await waitForBoolean(() => profiler.isRunning())

    expect(profilingContextManager.get()?.status).toBe('running')

    // Stop collection of profile (sync - state changes immediately)
    profiler.stop()

    expect(profiler.isStopped()).toBe(true)
    expect(profilingContextManager.get()?.status).toBe('stopped')

    // Wait for data collection to complete (async fire-and-forget)
    await waitForBoolean(() => interceptor.requests.length >= 1)

    expect(interceptor.requests.length).toBe(1)

    const request = await readFormDataRequest<ProfileEventPayload>(interceptor.requests[0])
    expect(request.event.session?.id).toBe('session-id-1')
    expect(request['wall-time.json']).toEqual(mockedRumProfilerTrace)
  })

  it('should pause profiling collection on hidden visibility and restart on visible visibility', async () => {
    const { profiler, profilingContextManager, mockedRumProfilerTrace } = setupProfiler()

    profiler.start()

    // Wait for start of collection.
    await waitForBoolean(() => profiler.isRunning())
    expect(profilingContextManager.get()?.status).toBe('running')

    // Emulate visibility change to `hidden` state
    setVisibilityState('hidden')

    // Wait for profiler to pause
    await waitForBoolean(() => profiler.isPaused())

    // From an external point of view, the profiler is still running, but it's not collecting data.
    expect(profilingContextManager.get()?.status).toBe('running')

    // Wait for data collection to complete (async fire-and-forget)
    await waitForBoolean(() => interceptor.requests.length >= 1)

    // Assert that the profiler has collected data on pause.
    expect(interceptor.requests.length).toBe(1)

    // Change back to visible
    setVisibilityState('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    // Wait for profiler to restart
    await waitForBoolean(() => profiler.isRunning())
    expect(profilingContextManager.get()?.status).toBe('running')

    // Stop collection of profile (sync - state changes immediately)
    profiler.stop()

    expect(profiler.isStopped()).toBe(true)
    expect(profilingContextManager.get()?.status).toBe('stopped')

    // Wait for data collection to complete (async fire-and-forget)
    await waitForBoolean(() => interceptor.requests.length >= 2)

    expect(interceptor.requests.length).toBe(2)

    // Check the the sendProfilesSpy was called with the mocked trace
    const request = await readFormDataRequest<ProfileEventPayload>(interceptor.requests[1])

    expect(request.event.session?.id).toBe('session-id-1')
    expect(request['wall-time.json']).toEqual(mockedRumProfilerTrace)
  })

  it('should collect long task happening during a profiling session', async () => {
    const clock = mockClock()
    const { profiler, profilingContextManager, addLongTask } = setupProfiler()

    // Start collection of profile.
    profiler.start()
    await waitForBoolean(() => profiler.isRunning())

    expect(profilingContextManager.get()?.status).toBe('running')
    addLongTask({
      id: 'long-task-id-1',
      startClocks: clocksNow(),
      duration: 50 as Duration,
      entryType: RumPerformanceEntryType.LONG_ANIMATION_FRAME,
    })
    clock.tick(50)

    addLongTask({
      id: 'long-task-id-2',
      startClocks: clocksNow(),
      duration: 100 as Duration,
      entryType: RumPerformanceEntryType.LONG_ANIMATION_FRAME,
    })

    // Stop first profiling session (sync - state changes immediately)
    clock.tick(105)
    profiler.stop()
    expect(profiler.isStopped()).toBe(true)

    // Flush microtasks for first session's data collection
    await waitNextMicrotask()

    // start a new profiling session
    profiler.start()
    await waitForBoolean(() => profiler.isRunning())

    addLongTask({
      id: 'long-task-id-3',
      startClocks: clocksNow(),
      duration: 100 as Duration,
      entryType: RumPerformanceEntryType.LONG_ANIMATION_FRAME,
    })

    clock.tick(500)

    // stop the second profiling session (sync - state changes immediately)
    profiler.stop()
    expect(profiler.isStopped()).toBe(true)
    expect(profilingContextManager.get()?.status).toBe('stopped')

    // Data collection uses Promises (microtasks), not setTimeout.
    // With mockClock(), we can't use waitForBoolean (which polls via setTimeout).
    // Flush microtasks: one for profiler.stop() Promise, one for transport.send()
    await waitNextMicrotask()
    await waitNextMicrotask()

    expect(interceptor.requests.length).toBe(2)

    const requestOne = await readFormDataRequest<ProfileEventPayload>(interceptor.requests[0])
    const requestTwo = await readFormDataRequest<ProfileEventPayload>(interceptor.requests[1])

    const traceOne = requestOne['wall-time.json']
    const traceTwo = requestTwo['wall-time.json']

    expect(requestOne.event.long_task?.id.length).toBe(2)
    expect(traceOne.longTasks).toEqual([
      {
        id: 'long-task-id-2',
        startClocks: jasmine.any(Object),
        duration: 100 as Duration,
        entryType: RumPerformanceEntryType.LONG_ANIMATION_FRAME,
      },
      {
        id: 'long-task-id-1',
        startClocks: jasmine.any(Object),
        duration: 50 as Duration,
        entryType: RumPerformanceEntryType.LONG_ANIMATION_FRAME,
      },
    ])

    expect(requestTwo.event.long_task?.id.length).toBe(1)
    expect(traceTwo.longTasks).toEqual([
      {
        id: 'long-task-id-3',
        startClocks: jasmine.any(Object),
        duration: 100 as Duration,
        entryType: RumPerformanceEntryType.LONG_ANIMATION_FRAME,
      },
    ])
  })

  it('should collect views and set default view name in the Profile', async () => {
    const initialViewEntry = {
      id: 'view-user',
      name: '', // no custom view name, should fallback to default view name
      startClocks: {
        relative: relativeNow(),
        timeStamp: timeStampNow(),
      },
    }
    const { profiler, profilingContextManager } = setupProfiler(initialViewEntry)

    // Navigate to the user view
    history.pushState({}, '', '/user/123')

    profiler.start()

    await waitForBoolean(() => profiler.isRunning())

    expect(profilingContextManager.get()?.status).toBe('running')

    // Navigate to the profile view
    history.pushState({}, '', '/v1/user/3A2/profile')

    // Emit a view created event
    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
      id: 'view-profile',
      name: '', // no custom view name, should fallback to default view name
      startClocks: {
        relative: relativeNow(),
        timeStamp: timeStampNow(),
      },
    })

    // Stop collection of profile (sync - state changes immediately)
    profiler.stop()

    expect(profiler.isStopped()).toBe(true)
    expect(profilingContextManager.get()?.status).toBe('stopped')

    // Wait for data collection to complete (async fire-and-forget)
    await waitForBoolean(() => interceptor.requests.length >= 1)

    const request = await readFormDataRequest<ProfileEventPayload>(interceptor.requests[0])
    const views = request['wall-time.json'].views

    expect(views.length).toBe(2)
    expect(views[0].viewId).toBe('view-user')
    expect(views[0].viewName).toBe('/user/?')
    expect(views[1].viewId).toBe('view-profile')
    expect(views[1].viewName).toBe('/v1/user/?/profile')
  })

  it('should keep track of the latest view in the Profiler', async () => {
    const initialViewEntry = {
      id: 'view-initial',
      name: 'view-initial',
      startClocks: {
        relative: relativeNow(),
        timeStamp: timeStampNow(),
      },
    }

    const { profiler, profilingContextManager, mockedRumProfilerTrace } = setupProfiler(initialViewEntry)

    // Navigate to the user view
    history.pushState({}, '', '/user/123')

    profiler.start()

    await waitForBoolean(() => profiler.isRunning())
    expect(profilingContextManager.get()?.status).toBe('running')

    // Navigate to a new profile view
    history.pushState({}, '', '/v1/user/3A2/profile')

    const nextViewEntry = {
      id: 'view-next',
      name: 'view-next',
      startClocks: {
        relative: relativeNow(),
        timeStamp: timeStampNow(),
      },
    }

    // Emit a view created event
    lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, nextViewEntry)

    // Emulate visibility change to `hidden` state
    setVisibilityState('hidden')

    // Wait for profiler to pause
    await waitForBoolean(() => profiler.isPaused())

    // Wait for data collection to complete (async fire-and-forget)
    await waitForBoolean(() => interceptor.requests.length >= 1)

    // Assert that the profiler has collected data on pause.
    expect(interceptor.requests.length).toBe(1)

    const request = await readFormDataRequest<ProfileEventPayload>(interceptor.requests[0])
    expect(request.event.session?.id).toBe('session-id-1')
    expect(request['wall-time.json'].views).toEqual([
      {
        viewId: initialViewEntry.id,
        viewName: initialViewEntry.name,
        startClocks: initialViewEntry.startClocks,
      },
      {
        viewId: nextViewEntry.id,
        viewName: nextViewEntry.name,
        startClocks: nextViewEntry.startClocks,
      },
    ])

    // Change back to visible
    setVisibilityState('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    // Wait for profiler to restart
    await waitForBoolean(() => profiler.isRunning())
    expect(profilingContextManager.get()?.status).toBe('running')

    // Stop collection of profile (sync - state changes immediately)
    profiler.stop()

    expect(profiler.isStopped()).toBe(true)
    expect(profilingContextManager.get()?.status).toBe('stopped')

    // Wait for data collection to complete (async fire-and-forget)
    await waitForBoolean(() => interceptor.requests.length >= 2)

    expect(interceptor.requests.length).toBe(2)

    // Check the the sendProfilesSpy was called with the mocked trace
    const request2 = await readFormDataRequest<ProfileEventPayload>(interceptor.requests[1])
    expect(request2.event.session?.id).toBe('session-id-1')
    expect(request2['wall-time.json']).toEqual(mockedRumProfilerTrace)
  })

  it('should stop profiling when session expires', async () => {
    const { profiler, profilingContextManager } = setupProfiler()

    profiler.start()

    // Wait for start of collection.
    await waitForBoolean(() => profiler.isRunning())

    expect(profilingContextManager.get()?.status).toBe('running')

    // Notify that the session has expired (sync - state changes immediately)
    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

    expect(profiler.isStopped()).toBe(true)
    expect(profilingContextManager.get()?.status).toBe('stopped')

    // Wait for data collection to complete (async fire-and-forget)
    await waitForBoolean(() => interceptor.requests.length >= 1)

    // Verify that profiler collected data before stopping
    expect(interceptor.requests.length).toBe(1)
  })

  it('should not restart profiling after session expiration when visibility changes', async () => {
    const { profiler, profilingContextManager } = setupProfiler()

    profiler.start()

    // Wait for start of collection.
    await waitForBoolean(() => profiler.isRunning())

    expect(profilingContextManager.get()?.status).toBe('running')

    // Notify that the session has expired (sync - state changes immediately)
    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

    expect(profiler.isStopped()).toBe(true)
    expect(profilingContextManager.get()?.status).toBe('stopped')

    // Change visibility to hidden and back to visible
    setVisibilityState('hidden')

    setVisibilityState('visible')

    // Wait a bit to ensure profiler doesn't restart
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Profiler should remain stopped, not paused or running
    expect(profiler.isStopped()).toBe(true)
    expect(profilingContextManager.get()?.status).toBe('stopped')
  })

  it('should restart profiling when session is renewed', async () => {
    const { profiler, profilingContextManager } = setupProfiler()

    profiler.start()

    // Wait for start of collection.
    await waitForBoolean(() => profiler.isRunning())

    expect(profilingContextManager.get()?.status).toBe('running')

    // Notify that the session has expired (sync - state changes immediately)
    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

    expect(profiler.isStopped()).toBe(true)
    expect(profilingContextManager.get()?.status).toBe('stopped')

    // Wait for data collection to complete (async fire-and-forget)
    await waitForBoolean(() => interceptor.requests.length >= 1)

    // Verify that profiler collected data before stopping
    expect(interceptor.requests.length).toBe(1)

    // Notify that the session has been renewed
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    // Wait for profiler to restart
    await waitForBoolean(() => profiler.isRunning())

    expect(profilingContextManager.get()?.status).toBe('running')

    // Stop profiler and verify it collected data from the new session (sync)
    profiler.stop()

    expect(profiler.isStopped()).toBe(true)

    // Wait for data collection to complete (async fire-and-forget)
    await waitForBoolean(() => interceptor.requests.length >= 2)

    // Should have collected data from both sessions (before expiration and after renewal)
    expect(interceptor.requests.length).toBe(2)
  })

  it('should handle multiple session expiration and renewal cycles', async () => {
    const { profiler, profilingContextManager } = setupProfiler()

    profiler.start()

    // Wait for start of collection.
    await waitForBoolean(() => profiler.isRunning())

    expect(profilingContextManager.get()?.status).toBe('running')

    // First cycle: expire and renew (sync - state changes immediately)
    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
    expect(profiler.isStopped()).toBe(true)
    expect(profilingContextManager.get()?.status).toBe('stopped')

    await waitForBoolean(() => interceptor.requests.length >= 1)
    expect(interceptor.requests.length).toBe(1)

    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
    await waitForBoolean(() => profiler.isRunning())
    expect(profilingContextManager.get()?.status).toBe('running')

    // Second cycle: expire and renew again (sync)
    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
    expect(profiler.isStopped()).toBe(true)
    expect(profilingContextManager.get()?.status).toBe('stopped')

    await waitForBoolean(() => interceptor.requests.length >= 2)
    expect(interceptor.requests.length).toBe(2)

    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
    await waitForBoolean(() => profiler.isRunning())
    expect(profilingContextManager.get()?.status).toBe('running')

    // Stop profiler (sync)
    profiler.stop()
    expect(profiler.isStopped()).toBe(true)

    // Should have collected data from: initial session + first renewal + second renewal = 3 profiles
    await waitForBoolean(() => interceptor.requests.length >= 3)
    expect(interceptor.requests.length).toBe(3)
  })

  it('should not restart profiling on session renewal if profiler was manually stopped', async () => {
    const { profiler, profilingContextManager } = setupProfiler()

    profiler.start()

    // Wait for start of collection.
    await waitForBoolean(() => profiler.isRunning())

    expect(profilingContextManager.get()?.status).toBe('running')

    // Manually stop the profiler (not via session expiration) - sync
    profiler.stop()

    expect(profiler.isStopped()).toBe(true)
    expect(profilingContextManager.get()?.status).toBe('stopped')

    // Notify that the session has been renewed
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    // Wait a bit to ensure profiler doesn't restart
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Profiler should remain stopped - manual stop should not be overridden by session renewal
    expect(profiler.isStopped()).toBe(true)
    expect(profilingContextManager.get()?.status).toBe('stopped')
  })

  it('should restart profiling when session renews while stop is still in progress', async () => {
    const { profiler, profilingContextManager } = setupProfiler()

    profiler.start()

    // Wait for start of collection.
    await waitForBoolean(() => profiler.isRunning())

    expect(profilingContextManager.get()?.status).toBe('running')

    // Session expires while profiler is running
    // With sync state changes, the profiler state becomes 'stopped' immediately
    // while data collection continues in the background (fire-and-forget)
    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

    // State is immediately 'stopped' (sync), even though data collection is async
    expect(profiler.isStopped()).toBe(true)

    // Session renews IMMEDIATELY - even before async data collection completes
    // This simulates the scenario where user activity triggers renewal
    // while data is still being collected in the background
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    // The profiler should restart because the sync state was already 'stopped'
    // when SESSION_RENEWED fired
    await waitForBoolean(() => profiler.isRunning())

    expect(profiler.isRunning()).toBe(true)
    expect(profilingContextManager.get()?.status).toBe('running')

    // Clean up
    profiler.stop()
    expect(profiler.isStopped()).toBe(true)
  })

  it('should not restart profiling on session renewal if user called stop after session expiration', async () => {
    const { profiler, profilingContextManager } = setupProfiler()

    profiler.start()

    // Wait for start of collection.
    await waitForBoolean(() => profiler.isRunning())

    expect(profilingContextManager.get()?.status).toBe('running')

    // Session expires (sync - state changes immediately)
    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

    expect(profiler.isStopped()).toBe(true)
    expect(profilingContextManager.get()?.status).toBe('stopped')

    // User explicitly stops the profiler after session expiration
    profiler.stop()

    expect(profiler.isStopped()).toBe(true)

    // Session is renewed — start() is called synchronously, so no need to wait
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    // Profiler should remain stopped - user's explicit stop should take priority over session expiration
    expect(profiler.isStopped()).toBe(true)
    expect(profilingContextManager.get()?.status).toBe('stopped')
  })

  it('should restart profiling when session expires while paused and then renews', async () => {
    const { profiler, profilingContextManager } = setupProfiler()

    profiler.start()

    // Wait for start of collection.
    await waitForBoolean(() => profiler.isRunning())

    expect(profilingContextManager.get()?.status).toBe('running')

    // Pause the profiler by hiding the tab
    setVisibilityState('hidden')

    // Wait for profiler to pause
    await waitForBoolean(() => profiler.isPaused())

    // Session expires while profiler is paused (sync - state changes immediately)
    lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)

    expect(profiler.isStopped()).toBe(true)
    expect(profilingContextManager.get()?.status).toBe('stopped')

    // Session is renewed
    lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    // Wait for profiler to restart
    await waitForBoolean(() => profiler.isRunning())
    expect(profilingContextManager.get()?.status).toBe('running')

    // Clean up
    profiler.stop()
    expect(profiler.isStopped()).toBe(true)
  })
})

function waitForBoolean(booleanCallback: () => boolean) {
  return new Promise<void>((resolve) => {
    function poll() {
      if (booleanCallback()) {
        resolve()
      } else {
        setTimeout(() => poll(), 50)
      }
    }
    poll()
  })
}

function setVisibilityState(state: 'hidden' | 'visible') {
  setPageVisibility(state)
  window.dispatchEvent(createNewEvent('visibilitychange'))
}
