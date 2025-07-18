import {
  LifeCycle,
  LifeCycleEventType,
  RumEventType,
  RumPerformanceEntryType,
  createHooks,
} from '@datadog/browser-rum-core'
import type { RelativeTime } from '@datadog/browser-core'
import { clocksOrigin, deepClone, relativeNow, timeStampNow } from '@datadog/browser-core'
import { setPageVisibility, restorePageVisibility, createNewEvent } from '@datadog/browser-core/test'
import type { RumPerformanceEntry } from 'packages/rum-core/src/browser/performanceObservable'
import {
  createPerformanceEntry,
  createRawRumEvent,
  createRumSessionManagerMock,
  mockPerformanceObserver,
  mockRumConfiguration,
} from '../../../../rum-core/test'
import { mockProfiler } from '../../../test'
import { mockedTrace } from './test-utils/mockedTrace'
import { transport } from './transport/transport'
import { createRumProfiler } from './profiler'
import type { ProfilerTrace, RUMProfiler, RumProfilerTrace } from './types'
import type { ProfilingContextManager } from './profilingContext'
import { startProfilingContext } from './profilingContext'

describe('profiler', () => {
  // Store the original pathname
  const originalPathname = document.location.pathname
  let sendProfileSpy: jasmine.Spy<typeof transport.sendProfile>

  beforeEach(() => {
    // Spy on transport.sendProfile to avoid sending data to the server, and check what's sent.
    sendProfileSpy = spyOn(transport, 'sendProfile')
  })

  afterEach(() => {
    restorePageVisibility()
    // Go back to the original pathname
    history.pushState({}, '', originalPathname)
  })

  let lifeCycle = new LifeCycle()

  function setupProfiler(): {
    profiler: RUMProfiler
    notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void
    profilingContextManager: ProfilingContextManager
    mockedRumProfilerTrace: RumProfilerTrace
  } {
    const sessionManager = createRumSessionManagerMock().setId('session-id-1')
    lifeCycle = new LifeCycle()
    const hooks = createHooks()
    const profilingContextManager: ProfilingContextManager = startProfilingContext(hooks)
    const { notifyPerformanceEntries } = mockPerformanceObserver()

    const mockProfilerTrace: ProfilerTrace = deepClone(mockedTrace)

    const mockedRumProfilerTrace: RumProfilerTrace = Object.assign(mockProfilerTrace, {
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

    // Replace Browser's Profiler with a mock for testing purpose.
    mockProfiler(mockProfilerTrace)

    // Start collection of profile.
    const profiler = createRumProfiler(
      mockRumConfiguration({ trackLongTasks: true, profilingSampleRate: 100 }),
      lifeCycle,
      sessionManager,
      profilingContextManager,
      // Overrides default configuration for testing purpose.
      {
        sampleIntervalMs: 10,
        collectIntervalMs: 60000, // 1min
        minNumberOfSamples: 0,
        minProfileDurationMs: 0,
      }
    )
    return { profiler, notifyPerformanceEntries, profilingContextManager, mockedRumProfilerTrace }
  }

  it('should start profiling collection and collect data on stop', async () => {
    const { profiler, profilingContextManager, mockedRumProfilerTrace } = setupProfiler()

    expect(profilingContextManager.get()?.status).toBe('starting')

    profiler.start({
      id: 'view-id-1',
      name: 'view-name-1',
      startClocks: {
        relative: relativeNow(),
        timeStamp: timeStampNow(),
      },
    })

    // Wait for start of collection.
    await waitForBoolean(() => profiler.isRunning())

    expect(profilingContextManager.get()?.status).toBe('running')

    // Stop collection of profile.
    await profiler.stop()

    // Wait for stop of collection.
    await waitForBoolean(() => profiler.isStopped())

    expect(profilingContextManager.get()?.status).toBe('stopped')

    expect(sendProfileSpy).toHaveBeenCalledTimes(1)

    // Check the the sendProfilesSpy was called with the mocked trace
    expect(sendProfileSpy).toHaveBeenCalledWith(mockedRumProfilerTrace, jasmine.any(Object), 'session-id-1')
  })

  it('should pause profiling collection on hidden visibility and restart on visible visibility', async () => {
    const { profiler, profilingContextManager, mockedRumProfilerTrace } = setupProfiler()

    profiler.start({
      id: 'view-id-1',
      name: 'view-name-1',
      startClocks: {
        relative: relativeNow(),
        timeStamp: timeStampNow(),
      },
    })

    // Wait for start of collection.
    await waitForBoolean(() => profiler.isRunning())
    expect(profilingContextManager.get()?.status).toBe('running')

    // Emulate visibility change to `hidden` state
    setVisibilityState('hidden')

    // Wait for profiler to pause
    await waitForBoolean(() => profiler.isPaused())

    // From an external point of view, the profiler is still running, but it's not collecting data.
    expect(profilingContextManager.get()?.status).toBe('running')

    // Assert that the profiler has collected data on pause.
    expect(sendProfileSpy).toHaveBeenCalledTimes(1)

    // Change back to visible
    setVisibilityState('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    // Wait for profiler to restart
    await waitForBoolean(() => profiler.isRunning())
    expect(profilingContextManager.get()?.status).toBe('running')

    // Stop collection of profile.
    await profiler.stop()

    // Wait for stop of collection.
    await waitForBoolean(() => profiler.isStopped())
    expect(profilingContextManager.get()?.status).toBe('stopped')

    expect(sendProfileSpy).toHaveBeenCalledTimes(2)

    // Check the the sendProfilesSpy was called with the mocked trace
    expect(sendProfileSpy).toHaveBeenCalledWith(mockedRumProfilerTrace, jasmine.any(Object), 'session-id-1')
  })

  it('should collect long task from core and then attach long task id to the Profiler trace', async () => {
    const { profiler, notifyPerformanceEntries, profilingContextManager } = setupProfiler()

    profiler.start({
      id: 'view-id-1',
      name: 'view-name-1',
      startClocks: {
        relative: relativeNow(),
        timeStamp: timeStampNow(),
      },
    })

    await waitForBoolean(() => profiler.isRunning())

    expect(profilingContextManager.get()?.status).toBe('running')

    // Generate a Long Task RUM event
    const longTaskRumEvent = createRawRumEvent(RumEventType.LONG_TASK, {
      long_task: {
        id: 'long-task-id-1',
        duration: 1000,
        startTime: 12345 as RelativeTime,
      },
    })

    // Notify Profiler that a Long Task RUM event has been collected (via its LifeCycle)
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      rawRumEvent: longTaskRumEvent,
      startTime: 12345 as RelativeTime,
      domainContext: {},
    })

    // Notify Profiler that some long tasks have been collected (via its PerformanceObserver)
    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.LONG_ANIMATION_FRAME, {
        startTime: 12345 as RelativeTime,
        entryType: RumPerformanceEntryType.LONG_ANIMATION_FRAME,
      }),
    ])

    // Stop collection of profile.
    await profiler.stop()

    // Wait for stop of collection.
    await waitForBoolean(() => profiler.isStopped())

    expect(profilingContextManager.get()?.status).toBe('stopped')

    const lastCall: RumProfilerTrace = sendProfileSpy.calls.mostRecent().args[0]

    expect(lastCall.longTasks.length).toBe(1)
    expect(lastCall.longTasks[0].id).toBeDefined()
    expect(lastCall.longTasks[0].startClocks.relative).toBe(12345 as RelativeTime)
  })

  it('should collect views and set default view name in the Profile', async () => {
    const { profiler, profilingContextManager } = setupProfiler()

    // Navigate to the user view
    history.pushState({}, '', '/user/123')

    profiler.start({
      id: 'view-user',
      name: '', // no custom view name, should fallback to default view name
      startClocks: {
        relative: relativeNow(),
        timeStamp: timeStampNow(),
      },
    })

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

    // Stop collection of profile.
    await profiler.stop()

    // Wait for stop of collection.
    await waitForBoolean(() => profiler.isStopped())

    expect(profilingContextManager.get()?.status).toBe('stopped')

    const lastCall: RumProfilerTrace = sendProfileSpy.calls.mostRecent().args[0]

    expect(lastCall.views.length).toBe(2)
    expect(lastCall.views[0].viewId).toBe('view-user')
    expect(lastCall.views[0].viewName).toBe('/user/?')
    expect(lastCall.views[1].viewId).toBe('view-profile')
    expect(lastCall.views[1].viewName).toBe('/v1/user/?/profile')
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
