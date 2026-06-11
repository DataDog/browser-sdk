import {
  elapsed,
  timeStampNow,
  addDuration,
  clocksNow,
  clocksOrigin,
  ONE_DAY,
  relativeNow,
} from '@datadog/js-core/time'
import type { Duration } from '@datadog/js-core/time'
import type { ProfilerTrace } from '@datadog/browser-core'
import type { ViewHistoryEntry } from '@datadog/browser-rum-core'
import {
  LifeCycle,
  LifeCycleEventType,
  RumPerformanceEntryType,
  VitalType,
  createHooks,
} from '@datadog/browser-rum-core'
import { createIdentityEncoder, createValueHistory, deepClone } from '@datadog/browser-core'
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
  createSessionManagerMock,
  replaceMockableWithSpy,
  HIGH_HASH_UUID,
  LOW_HASH_UUID,
} from '@datadog/browser-core/test'
import { mockRumConfiguration, mockViewHistory } from '../../../../browser-rum-core/test'
import { mockProfiler } from '../../../test'
import type { BrowserProfilerTrace } from '../../types'
import { checkProfilingQuota } from './quotaCheck'
import { mockedTrace } from './test-utils/mockedTrace'
import { createRumProfiler } from './datadogProfiler'
import type { RUMProfilerConfiguration } from './types'
import type { ProfilingContextManager } from './profilingContext'
import { startProfilingContext } from './profilingContext'
import type { ProfileEventPayload } from './transport/assembly'
import { createLongTaskHistory, type LongTaskContext } from './longTaskHistory'
import type { ActionContext } from './actionHistory'
import { createActionHistory } from './actionHistory'
import type { VitalContext } from './vitalHistory'
import { createVitalHistory } from './vitalHistory'

describe('profiler', () => {
  // Store the original pathname
  const originalPathname = document.location.pathname
  let interceptor: ReturnType<typeof interceptRequests>
  let checkProfilingQuotaSpy: jasmine.Spy

  beforeEach(() => {
    interceptor = interceptRequests()
    interceptor.withFetch(DEFAULT_FETCH_MOCK, DEFAULT_FETCH_MOCK, DEFAULT_FETCH_MOCK)
    // Default: quota always ok. Individual quota-check tests can reconfigure via spy.and.callFake(...)
    checkProfilingQuotaSpy = replaceMockableWithSpy(checkProfilingQuota)
    checkProfilingQuotaSpy.and.returnValue(Promise.resolve({ decision: 'quota_ok', reason: 'quota_ok' }))
  })

  afterEach(() => {
    restorePageVisibility()
    // Go back to the original pathname
    history.pushState({}, '', originalPathname)
  })

  let lifeCycle = new LifeCycle()

  function setupProfiler(currentView?: ViewHistoryEntry, profilerConfigOverrides?: Partial<RUMProfilerConfiguration>) {
    const sessionManager = createSessionManagerMock().setId('session-id-1')
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
      actions: [],
      vitals: [],
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

    const actionHistory = createValueHistory<ActionContext>({
      expireDelay: ONE_DAY,
    })
    replaceMockable(createActionHistory, () => actionHistory)

    const vitalHistory = createValueHistory<VitalContext>({
      expireDelay: ONE_DAY,
    })
    replaceMockable(createVitalHistory, () => vitalHistory)

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
        minProfileDurationMs: 0,
        ...profilerConfigOverrides,
      }
    )
    return {
      profiler,
      profilingContextManager,
      sessionManager,
      mockedRumProfilerTrace,
      addLongTask: (longTask: LongTaskContext) => {
        longTaskHistory.add(longTask, relativeNow()).close(addDuration(relativeNow(), longTask.duration))
      },
      addAction: (action: ActionContext) => {
        actionHistory.add(action, relativeNow()).close(addDuration(relativeNow(), action.duration ?? (0 as Duration)))
      },
      addVital: (vital: VitalContext) => {
        vitalHistory.add(vital, relativeNow()).close(addDuration(relativeNow(), vital.duration ?? (0 as Duration)))
      },
      startOperationStep: (id: string, label: string, operationKey?: string) => {
        const startClocks = clocksNow()
        const entry = vitalHistory.add(
          { id, type: VitalType.OPERATION_STEP, label, operationKey, startClocks, duration: undefined },
          startClocks.relative
        )
        return () => {
          const endTime = relativeNow()
          entry.value.duration = elapsed(entry.startTime, endTime)
          entry.close(endTime)
        }
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

  it('should collect actions happening during a profiling session', async () => {
    const clock = mockClock()
    const { profiler, profilingContextManager, addAction } = setupProfiler()

    // Start collection of profile.
    profiler.start()
    await waitForBoolean(() => profiler.isRunning())

    expect(profilingContextManager.get()?.status).toBe('running')
    addAction({
      id: 'action-id-1',
      label: 'action-label-1',
      startClocks: clocksNow(),
      duration: 50 as Duration,
    })
    clock.tick(50)

    addAction({
      id: 'action-id-2',
      label: 'action-label-2',
      startClocks: clocksNow(),
      duration: 100 as Duration,
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

    addAction({
      id: 'action-id-3',
      label: 'action-label-3',
      startClocks: clocksNow(),
      duration: 100 as Duration,
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

    expect(requestOne.event.action?.id.length).toBe(2)
    expect(traceOne.actions).toEqual([
      {
        id: 'action-id-2',
        startClocks: jasmine.any(Object),
        duration: 100 as Duration,
        label: 'action-label-2',
      },
      {
        id: 'action-id-1',
        startClocks: jasmine.any(Object),
        duration: 50 as Duration,
        label: 'action-label-1',
      },
    ])

    expect(requestTwo.event.action?.id.length).toBe(1)
    expect(traceTwo.actions).toEqual([
      {
        id: 'action-id-3',
        startClocks: jasmine.any(Object),
        duration: 100 as Duration,
        label: 'action-label-3',
      },
    ])
  })

  it('should collect vitals happening during a profiling session', async () => {
    const clock = mockClock()
    const { profiler, profilingContextManager, addVital } = setupProfiler()

    // Start collection of profile.
    profiler.start()
    await waitForBoolean(() => profiler.isRunning())

    expect(profilingContextManager.get()?.status).toBe('running')
    addVital({
      id: 'vital-id-1',
      type: VitalType.DURATION,
      label: 'vital-label-1',
      startClocks: clocksNow(),
      duration: 50 as Duration,
    })
    clock.tick(50)

    addVital({
      id: 'vital-id-2',
      type: VitalType.DURATION,
      label: 'vital-label-2',
      startClocks: clocksNow(),
      duration: 100 as Duration,
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

    addVital({
      id: 'vital-id-3',
      type: VitalType.DURATION,
      label: 'vital-label-3',
      startClocks: clocksNow(),
      duration: 100 as Duration,
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

    expect(requestOne.event.vital?.id.length).toBe(2)
    expect(traceOne.vitals).toEqual([
      {
        id: 'vital-id-2',
        startClocks: jasmine.any(Object),
        duration: 100 as Duration,
        label: 'vital-label-2',
      },
      {
        id: 'vital-id-1',
        startClocks: jasmine.any(Object),
        duration: 50 as Duration,
        label: 'vital-label-1',
      },
    ])

    expect(requestTwo.event.vital?.id.length).toBe(1)
    expect(traceTwo.vitals).toEqual([
      {
        id: 'vital-id-3',
        startClocks: jasmine.any(Object),
        duration: 100 as Duration,
        label: 'vital-label-3',
      },
    ])
  })

  it('should collect all ongoing operations during a profiling session', async () => {
    const clock = mockClock()
    const { profiler, startOperationStep } = setupProfiler()

    // Profile 1: start all three operations, end op1
    profiler.start()
    await waitForBoolean(() => profiler.isRunning())

    const endOp1 = startOperationStep('op-id-1', 'op-label-1')
    clock.tick(10)
    const endOp2 = startOperationStep('op-id-2', 'op-label-2')
    clock.tick(10)
    const endOp3 = startOperationStep('op-id-3', 'op-label-3')
    clock.tick(10)
    endOp1() // op1 ends during profile 1

    clock.tick(70)
    profiler.stop()
    await waitNextMicrotask()

    // Profile 2: end op2
    profiler.start()
    await waitForBoolean(() => profiler.isRunning())

    clock.tick(50)
    endOp2() // op2 ends during profile 2

    clock.tick(50)
    profiler.stop()
    await waitNextMicrotask()

    // Profile 3: end op3
    profiler.start()
    await waitForBoolean(() => profiler.isRunning())

    clock.tick(50)
    endOp3() // op3 ends during profile 3

    clock.tick(50)
    profiler.stop()
    await waitNextMicrotask()
    await waitNextMicrotask()

    expect(interceptor.requests.length).toBe(3)

    const req1 = await readFormDataRequest<ProfileEventPayload>(interceptor.requests[0])
    const req2 = await readFormDataRequest<ProfileEventPayload>(interceptor.requests[1])
    const req3 = await readFormDataRequest<ProfileEventPayload>(interceptor.requests[2])

    const vitals1 = req1['wall-time.json'].vitals
    const vitals2 = req2['wall-time.json'].vitals
    const vitals3 = req3['wall-time.json'].vitals

    // Profile 1: all three operations present, only op1 has a duration
    expect(vitals1?.map((v) => v.id)).toEqual(jasmine.arrayContaining(['op-id-1', 'op-id-2', 'op-id-3']))
    expect(vitals1?.find((v) => v.id === 'op-id-1')?.duration).toBe(30 as Duration)
    expect(vitals1?.find((v) => v.id === 'op-id-2')?.duration).toBeUndefined()
    expect(vitals1?.find((v) => v.id === 'op-id-3')?.duration).toBeUndefined()

    // Profile 2: op1 is gone (ended before profile 2 started), op2 and op3 present, only op2 has a duration
    expect(vitals2?.map((v) => v.id)).not.toContain('op-id-1')
    expect(vitals2?.map((v) => v.id)).toEqual(jasmine.arrayContaining(['op-id-2', 'op-id-3']))
    expect(vitals2?.find((v) => v.id === 'op-id-2')?.duration).toBe(140 as Duration)
    expect(vitals2?.find((v) => v.id === 'op-id-3')?.duration).toBeUndefined()

    // Profile 3: only op3 remains, with a duration
    expect(vitals3?.map((v) => v.id)).not.toContain('op-id-1')
    expect(vitals3?.map((v) => v.id)).not.toContain('op-id-2')
    expect(vitals3?.length).toBe(1)
    expect(vitals3?.[0].id).toBe('op-id-3')
    expect(vitals3?.[0].duration).toBe(230 as Duration)
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

  it('should not restart profiling on session renewal when new session is not sampled for profiling', async () => {
    mockProfiler(deepClone(mockedTrace))
    const testLifeCycle = new LifeCycle()
    const hooks = createHooks()
    const profilingContextManager = startProfilingContext(hooks)
    // Initial session uses LOW_HASH_UUID (sampled at any rate)
    const sessionManager = createSessionManagerMock().setId(LOW_HASH_UUID)

    const profiler = createRumProfiler(
      mockRumConfiguration({ sessionSampleRate: 100, profilingSampleRate: 50 }),
      testLifeCycle,
      sessionManager,
      profilingContextManager,
      createIdentityEncoder,
      mockViewHistory(),
      { sampleIntervalMs: 10, collectIntervalMs: 60000, minProfileDurationMs: 0 }
    )

    // Start directly, simulating profilerApi.ts having validated the initial session
    profiler.start()
    await waitForBoolean(() => profiler.isRunning())

    // Session expires
    testLifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
    expect(profiler.isStopped()).toBeTrue()

    // Session renews with HIGH_HASH_UUID, which is not sampled at profilingSampleRate: 50
    sessionManager.setId(HIGH_HASH_UUID)
    testLifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(profiler.isStopped()).toBeTrue()

    profiler.stop()
  })

  it('should not include long tasks outside the profiling window when clocks drift', async () => {
    const clock = mockClock()
    const timeOrigin = performance.timing.navigationStart
    const { profiler, addLongTask } = setupProfiler()

    profiler.start()
    expect(profiler.isRunning()).toBe(true)

    // Add a long task at T=100ms (inside the profile window)
    clock.tick(100)
    addLongTask({
      id: 'long-task-inside',
      startClocks: clocksNow(),
      duration: 50 as Duration,
      entryType: RumPerformanceEntryType.LONG_ANIMATION_FRAME,
    })

    // Add a long task at T=1000ms (outside the actual profile relative window)
    clock.tick(900)
    addLongTask({
      id: 'long-task-outside',
      startClocks: clocksNow(),
      duration: 50 as Duration,
      entryType: RumPerformanceEntryType.LONG_ANIMATION_FRAME,
    })

    // Advance to T=1100ms
    clock.tick(100)

    // Simulate clock drift: Date.now() drifted 1000ms ahead of performance.now()
    // This mimics NTP sync or system clock adjustments in production
    ;(performance.now as jasmine.Spy).and.callFake(() => Date.now() - timeOrigin - 1000)

    // Stop profiler — state changes synchronously, data collection is async via Promise
    profiler.stop()
    expect(profiler.isStopped()).toBe(true)

    // Flush microtasks for profiler.stop() Promise and transport.send()
    await waitNextMicrotask()
    await waitNextMicrotask()

    expect(interceptor.requests.length).toBe(1)
    const request = await readFormDataRequest<ProfileEventPayload>(interceptor.requests[0])
    const trace = request['wall-time.json']

    // Should only include the long task that occurred during the actual profiling window.
    // Without the fix (using timeStamp for duration), both long tasks would be included
    // because the inflated timeStamp-based duration extends the query window.
    expect(trace.longTasks.length).toBe(1)
    expect(trace.longTasks[0].id).toBe('long-task-inside')
  })

  it('should use the profiling start time when looking up the session id', async () => {
    const clock = mockClock()
    const { profiler, sessionManager } = setupProfiler()
    const findTrackedSessionSpy = spyOn(sessionManager, 'findTrackedSession').and.callThrough()

    profiler.start()
    expect(profiler.isRunning()).toBe(true)

    const expectedStartTime = relativeNow()

    clock.tick(1000)

    profiler.stop()

    await waitNextMicrotask()
    await waitNextMicrotask()

    expect(findTrackedSessionSpy).toHaveBeenCalledWith(expectedStartTime)
  })

  describe('discard logic', () => {
    it('should discard profile when duration is below threshold and there are no long tasks', async () => {
      const clock = mockClock()
      const { profiler } = setupProfiler(undefined, { minProfileDurationMs: 5000 })

      profiler.start()
      expect(profiler.isRunning()).toBe(true)

      clock.tick(100)
      profiler.stop()
      expect(profiler.isStopped()).toBe(true)

      await waitNextMicrotask()
      await waitNextMicrotask()

      expect(interceptor.requests.length).toBe(0)
    })

    it('should send profile when below duration threshold if a long task is present', async () => {
      const clock = mockClock()
      const { profiler, addLongTask } = setupProfiler(undefined, { minProfileDurationMs: 5000 })

      profiler.start()
      expect(profiler.isRunning()).toBe(true)

      addLongTask({
        id: 'long-task-id',
        startClocks: clocksNow(),
        duration: 50 as Duration,
        entryType: RumPerformanceEntryType.LONG_ANIMATION_FRAME,
      })
      clock.tick(100)

      profiler.stop()
      expect(profiler.isStopped()).toBe(true)

      await waitNextMicrotask()
      await waitNextMicrotask()

      expect(interceptor.requests.length).toBe(1)
    })

    it('should send profile when duration threshold is met', async () => {
      const clock = mockClock()
      const { profiler } = setupProfiler(undefined, { minProfileDurationMs: 100 })

      profiler.start()
      expect(profiler.isRunning()).toBe(true)

      clock.tick(200)
      profiler.stop()
      expect(profiler.isStopped()).toBe(true)

      await waitNextMicrotask()
      await waitNextMicrotask()

      expect(interceptor.requests.length).toBe(1)
    })
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

  describe('quota check', () => {
    it('should stop profiler and set quota_exceeded context when quota check returns quota_exceeded', async () => {
      checkProfilingQuotaSpy.and.returnValue(Promise.resolve({ decision: 'quota_ko', reason: 'quota_exceeded' }))
      const { profiler, profilingContextManager } = setupProfiler()

      profiler.start()
      await waitForBoolean(() => profiler.isStopped())

      expect(profilingContextManager.get()).toEqual({
        status: 'stopped',
        error_reason: undefined,
        quota_reason: 'quota_exceeded',
      } as any)
      expect(interceptor.requests.length).toBe(0) // no data sent
    })

    it('should stop profiler and set org_disabled context when quota check returns org_disabled', async () => {
      checkProfilingQuotaSpy.and.returnValue(Promise.resolve({ decision: 'quota_ko', reason: 'org_disabled' }))
      const { profiler, profilingContextManager } = setupProfiler()

      profiler.start()
      await waitForBoolean(() => profiler.isStopped())

      expect(profilingContextManager.get()).toEqual({
        status: 'stopped',
        error_reason: undefined,
        quota_reason: 'org_disabled',
      } as any)
      expect(interceptor.requests.length).toBe(0) // no data sent
    })

    it('should stop profiler and set unknown_reason context when quota check returns unknown_reason', async () => {
      checkProfilingQuotaSpy.and.returnValue(Promise.resolve({ decision: 'quota_ko', reason: 'unknown_reason' }))
      const { profiler, profilingContextManager } = setupProfiler()

      profiler.start()
      await waitForBoolean(() => profiler.isStopped())

      expect(profilingContextManager.get()).toEqual({
        status: 'stopped',
        error_reason: undefined,
        quota_reason: 'unknown_reason',
      } as any)
      expect(interceptor.requests.length).toBe(0) // no data sent
    })

    it('should keep profiler running when quota check returns quota-ok', async () => {
      // default spy already returns quota-ok
      const { profiler, profilingContextManager } = setupProfiler()

      profiler.start()
      await waitForBoolean(() => profiler.isRunning())

      expect(profiler.isRunning()).toBe(true)
      expect(profilingContextManager.get()?.status).toBe('running')

      profiler.stop()
    })

    it('should not call quota check and proceed when sessionId is undefined at start', async () => {
      // default spy already returns quota-ok; we just verify it's never called
      mockProfiler(deepClone(mockedTrace))
      const hooks = createHooks()
      const profilingContextManager = startProfilingContext(hooks)
      const noSessionManager = createSessionManagerMock()
      spyOn(noSessionManager, 'findTrackedSession').and.returnValue(undefined)
      const profilerNoSession = createRumProfiler(
        mockRumConfiguration({ profilingSampleRate: 100 }),
        new LifeCycle(),
        noSessionManager,
        profilingContextManager,
        createIdentityEncoder,
        mockViewHistory(),
        { sampleIntervalMs: 10, collectIntervalMs: 60000, minProfileDurationMs: 0 }
      )

      profilerNoSession.start()
      await waitForBoolean(() => profilerNoSession.isRunning())

      expect(checkProfilingQuotaSpy).not.toHaveBeenCalled()
      expect(profilerNoSession.isRunning()).toBe(true)

      profilerNoSession.stop()
    })

    it('should discard quota-exceeded result when profiler was already stopped by user', async () => {
      let resolveQuota!: (result: { decision: string; reason: string }) => void
      checkProfilingQuotaSpy.and.callFake(
        () =>
          new Promise((resolve) => {
            resolveQuota = resolve
          })
      )
      const { profiler, profilingContextManager } = setupProfiler()

      profiler.start()
      await waitForBoolean(() => profiler.isRunning())

      profiler.stop()
      expect(profiler.isStopped()).toBe(true)
      expect(profilingContextManager.get()?.status).toBe('stopped')
      expect(profilingContextManager.get()?.error_reason).toBeUndefined()

      resolveQuota({ decision: 'quota_ko', reason: 'quota_exceeded' })
      await waitNextMicrotask()

      expect(profilingContextManager.get()?.error_reason).toBeUndefined()
    })

    it('should discard quota-exceeded result when SESSION_EXPIRED fired before quota resolved', async () => {
      let resolveQuota!: (result: { decision: string; reason: string }) => void
      checkProfilingQuotaSpy.and.callFake(
        () =>
          new Promise((resolve) => {
            resolveQuota = resolve
          })
      )
      const { profiler, profilingContextManager } = setupProfiler()

      profiler.start()
      await waitForBoolean(() => profiler.isRunning())

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
      expect(profiler.isStopped()).toBe(true)

      resolveQuota({ decision: 'quota_ko', reason: 'quota_exceeded' })
      await waitNextMicrotask()

      expect(profilingContextManager.get()?.error_reason).toBeUndefined()

      // data IS sent (normal session-expired collection happens)
      await waitForBoolean(() => interceptor.requests.length >= 1)
      expect(interceptor.requests.length).toBeGreaterThanOrEqual(1)
    })

    it('should stop profiler and not resume when quota-exceeded resolves while paused', async () => {
      let resolveQuota!: (result: { decision: string; reason: string }) => void
      checkProfilingQuotaSpy.and.callFake(
        () =>
          new Promise((resolve) => {
            resolveQuota = resolve
          })
      )
      const { profiler, profilingContextManager } = setupProfiler()

      profiler.start()
      await waitForBoolean(() => profiler.isRunning())

      setVisibilityState('hidden')
      await waitForBoolean(() => profiler.isPaused())

      resolveQuota({ decision: 'quota_ko', reason: 'quota_exceeded' })
      await waitNextMicrotask()

      expect(profiler.isStopped()).toBe(true)
      expect(profilingContextManager.get()).toEqual({
        status: 'stopped',
        error_reason: undefined,
        quota_reason: 'quota_exceeded',
      } as any)

      setVisibilityState('visible')
      await waitNextMicrotask()

      expect(profiler.isStopped()).toBe(true)
    })

    it('should discard stale quota result when SESSION_RENEWED restarts the profiler', async () => {
      let resolveOldQuota!: (result: { decision: string; reason: string }) => void
      let callCount = 0
      checkProfilingQuotaSpy.and.callFake(() => {
        callCount++
        if (callCount === 1) {
          return new Promise((resolve) => {
            resolveOldQuota = resolve
          })
        }
        return Promise.resolve({ decision: 'quota_ok', reason: 'quota_ok' })
      })
      const { profiler, profilingContextManager } = setupProfiler()

      profiler.start()
      await waitForBoolean(() => profiler.isRunning())

      lifeCycle.notify(LifeCycleEventType.SESSION_EXPIRED)
      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
      await waitForBoolean(() => profiler.isRunning())

      resolveOldQuota({ decision: 'quota_ko', reason: 'quota_exceeded' })
      await waitNextMicrotask()

      expect(profiler.isRunning()).toBe(true)
      expect(profilingContextManager.get()?.status).toBe('running')

      profiler.stop()
    })

    it('should restart profiler and re-check quota on SESSION_RENEWED after quota_exceeded or org_disabled', async () => {
      let callCount = 0
      checkProfilingQuotaSpy.and.callFake(() => {
        callCount++
        return Promise.resolve(
          callCount === 1
            ? { decision: 'quota_ko', reason: 'quota_exceeded' }
            : { decision: 'quota_ok', reason: 'quota_ok' }
        )
      })
      const { profiler } = setupProfiler()

      profiler.start()
      await waitForBoolean(() => profiler.isStopped())

      expect(callCount).toBe(1)

      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
      await waitForBoolean(() => profiler.isRunning())

      expect(callCount).toBe(2)
      expect(profiler.isRunning()).toBe(true)

      profiler.stop()
    })

    it('should NOT restart profiler on SESSION_RENEWED after stopped-by-user', async () => {
      // default spy already returns quota-ok
      const { profiler } = setupProfiler()

      profiler.start()
      await waitForBoolean(() => profiler.isRunning())

      profiler.stop()
      expect(profiler.isStopped()).toBe(true)

      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)
      await waitNextMicrotask()

      expect(profiler.isStopped()).toBe(true)
    })
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
