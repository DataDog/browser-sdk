import type { RelativeTime, ServerDuration } from '@datadog/browser-core'
import { collectAndValidateRawRumEvents, createPerformanceEntry, mockPerformanceObserver } from '../../../test'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import type { RawRumEvent } from '../../rawRumEvent.types'
import { RumEventType } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { RumConfiguration } from '../configuration'
import { startLongTaskCollection } from './longTaskCollection'

describe('long task collection', () => {
  let lifeCycle = new LifeCycle()
  let rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>> = []

  function setupLongTaskCollection(trackLongTasks = true) {
    lifeCycle = new LifeCycle()
    startLongTaskCollection(lifeCycle, { trackLongTasks } as RumConfiguration)

    rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)
  }

  it('should only listen to long task performance entry', () => {
    const { notifyPerformanceEntries } = mockPerformanceObserver()
    setupLongTaskCollection()

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.NAVIGATION)])
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LONG_TASK),
      createPerformanceEntry(RumPerformanceEntryType.PAINT),
    ])

    expect(rawRumEvents.length).toBe(1)
  })

  it('should collect when trackLongTasks=true', () => {
    setupLongTaskCollection()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LONG_TASK),
    ])
    expect(rawRumEvents.length).toBe(1)
  })

  it('should not collect when trackLongTasks=false', () => {
    setupLongTaskCollection(false)

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LONG_TASK),
    ])
    expect(rawRumEvents.length).toBe(0)
  })

  it('should create raw rum event from performance entry', () => {
    setupLongTaskCollection()
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LONG_TASK),
    ])

    expect(rawRumEvents[0].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      long_task: {
        id: jasmine.any(String),
        duration: (100 * 1e6) as ServerDuration,
      },
      type: RumEventType.LONG_TASK,
      _dd: {
        discarded: false,
      },
    })
    expect(rawRumEvents[0].domainContext).toEqual({
      performanceEntry: {
        name: 'self',
        duration: 100,
        entryType: 'longtask',
        startTime: 1234,
        toJSON: jasmine.any(Function),
      },
    })
  })
})
