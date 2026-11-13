import { deepClone } from '@datadog/js-core/util'
import { clocksNow, clocksOrigin } from '@datadog/js-core/time'
import type { Duration } from '@datadog/js-core/time'
import { LifeCycle, LifeCycleEventType, RumEventType, RumPerformanceEntryType } from '@datadog/browser-rum-core'
import { mockClock } from '@datadog/browser-core/test'
import { createRawRumEvent, mockRumConfiguration, mockViewHistory } from '../../../../browser-rum-core/test'
import { mockedTrace } from './test-utils/mockedTrace'
import { createProfileAssembly } from './profileAssembly'
import type { ProfilingPayload } from './types'

describe('createProfileAssembly', () => {
  function setupAssembly() {
    const emitPayload = jasmine.createSpy<(payload: ProfilingPayload) => void>('emitPayload')
    const lifeCycle = new LifeCycle()
    const assembly = createProfileAssembly(
      mockRumConfiguration({ applicationId: 'application-id' }),
      lifeCycle,
      mockViewHistory({ id: 'view-id', name: 'Home', startClocks: clocksNow() }),
      { sampleIntervalMs: 10, collectIntervalMs: 60000, minProfileDurationMs: 100 },
      emitPayload
    )
    return { assembly, emitPayload, lifeCycle }
  }

  it('enriches the trace and builds the profile event without mutating the input', () => {
    const clock = mockClock()
    const { assembly, emitPayload, lifeCycle } = setupAssembly()
    const trace = deepClone(mockedTrace)
    const startClocks = clocksNow()
    const duration = 50 as Duration
    for (const rawRumEvent of [
      createRawRumEvent(RumEventType.LONG_TASK, { long_task: { id: 'long-task-id' } }),
      createRawRumEvent(RumEventType.ACTION, { action: { id: 'action-id' } }),
      createRawRumEvent(RumEventType.VITAL, { vital: { id: 'vital-id', name: 'Checkout' } }),
    ]) {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent,
        startClocks,
        duration,
        domainContext: { performanceEntry: {} as PerformanceEntry },
      })
    }
    clock.tick(100)

    assembly.assemble(trace, startClocks, 'session-id')

    expect(emitPayload.calls.count()).toBe(1)
    const payload = emitPayload.calls.mostRecent().args[0]
    expect(payload.trace).toEqual(
      jasmine.objectContaining({
        startClocks,
        endClocks: clocksNow(),
        clocksOrigin: clocksOrigin(),
        sampleInterval: 10,
        views: [{ viewId: 'view-id', viewName: 'Home', startClocks }],
        longTasks: [{ id: 'long-task-id', startClocks, duration, entryType: RumPerformanceEntryType.LONG_TASK }],
        actions: [{ id: 'action-id', label: '', startClocks, duration }],
        vitals: [{ id: 'vital-id', label: 'Checkout', startClocks, duration }],
      })
    )
    expect(payload.trace.samples).toEqual(trace.samples)
    expect(payload.profile).toEqual(
      jasmine.objectContaining({
        application: { id: 'application-id' },
        session: { id: 'session-id' },
        view: { id: ['view-id'], name: ['Home'] },
        long_task: { id: ['long-task-id'] },
        action: { id: ['action-id'], label: [] },
        vital: { id: ['vital-id'], label: ['Checkout'] },
        start: new Date(startClocks.timeStamp).toISOString(),
        end: new Date(clocksNow().timeStamp).toISOString(),
      })
    )
    expect(trace).toEqual(mockedTrace)
    expect(payload.trace).not.toBe(trace)
  })

  it('discards short profiles without long tasks', () => {
    const clock = mockClock()
    const { assembly, emitPayload } = setupAssembly()
    const startClocks = clocksNow()
    clock.tick(99)

    assembly.assemble(deepClone(mockedTrace), startClocks, 'session-id')

    expect(emitPayload).not.toHaveBeenCalled()
  })
})
