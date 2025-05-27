import { LifeCycle, LifeCycleEventType, RumEventType, RumPerformanceEntryType } from '@datadog/browser-rum-core'
import type { RelativeTime } from '@datadog/browser-core'
import { relativeNow, timeStampNow } from '@datadog/browser-core'
import { setPageVisibility, restorePageVisibility, createNewEvent } from '@datadog/browser-core/test'
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
import type { RumProfilerTrace } from './types'

describe('profiler', () => {
  let sendProfileSpy: jasmine.Spy

  beforeEach(() => {
    // Spy on transport.sendProfile to avoid sending data to the server, and check what's sent.
    sendProfileSpy = spyOn(transport, 'sendProfile')
  })

  afterEach(() => {
    restorePageVisibility()
  })

  let lifeCycle = new LifeCycle()

  function setupProfiler() {
    const sessionManager = createRumSessionManagerMock().setId('session-id-1')
    lifeCycle = new LifeCycle()

    const { notifyPerformanceEntries } = mockPerformanceObserver()

    // Replace Browser's Profiler with a mock for testing purpose.
    mockProfiler(mockedTrace)

    // Start collection of profile.
    const profiler = createRumProfiler(
      mockRumConfiguration({ trackLongTasks: true, profilingSampleRate: 100 }),
      lifeCycle,
      sessionManager,
      // Overrides default configuration for testing purpose.
      {
        sampleIntervalMs: 10,
        collectIntervalMs: 60000, // 1min
        minNumberOfSamples: 0,
        minProfileDurationMs: 0,
      }
    )
    return { profiler, notifyPerformanceEntries }
  }

  it('should start profiling collection and collect data on stop', async () => {
    const { profiler } = setupProfiler()

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

    // Stop collection of profile.
    await profiler.stop()

    // Wait for stop of collection.
    await waitForBoolean(() => profiler.isStopped())

    expect(sendProfileSpy).toHaveBeenCalledTimes(1)

    // Check the the sendProfilesSpy was called with the mocked trace
    expect(sendProfileSpy).toHaveBeenCalledWith(mockedTrace, jasmine.any(Object), jasmine.any(String), 'session-id-1')
  })

  it('should pause profiling collection on hidden visibility and restart on visible visibility', async () => {
    const { profiler } = setupProfiler()

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

    // Emulate visibility change to `hidden` state
    setVisibilityState('hidden')

    // Wait for profiler to pause
    await waitForBoolean(() => profiler.isPaused())

    // Assert that the profiler has collected data on pause.
    expect(sendProfileSpy).toHaveBeenCalledTimes(1)

    // Change back to visible
    setVisibilityState('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    // Wait for profiler to restart
    await waitForBoolean(() => profiler.isRunning())

    // Stop collection of profile.
    await profiler.stop()

    // Wait for stop of collection.
    await waitForBoolean(() => profiler.isStopped())

    expect(sendProfileSpy).toHaveBeenCalledTimes(2)

    // Check the the sendProfilesSpy was called with the mocked trace
    expect(sendProfileSpy).toHaveBeenCalledWith(mockedTrace, jasmine.any(Object), jasmine.any(String), 'session-id-1')
  })

  it('should collect long task from core and then attach long task id to the Profiler trace', async () => {
    const { profiler, notifyPerformanceEntries } = setupProfiler()

    profiler.start({
      id: 'view-id-1',
      name: 'view-name-1',
      startClocks: {
        relative: relativeNow(),
        timeStamp: timeStampNow(),
      },
    })

    await waitForBoolean(() => profiler.isRunning())

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

    const lastCall: RumProfilerTrace = sendProfileSpy.calls.mostRecent().args[0] as unknown as RumProfilerTrace

    expect(lastCall.longTasks.length).toBe(1)
    expect(lastCall.longTasks[0].id).toBeDefined()
    expect(lastCall.longTasks[0].startClocks.relative).toBe(12345 as RelativeTime)
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
