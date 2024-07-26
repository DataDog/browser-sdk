import type { RelativeTime, ServerDuration } from '@datadog/browser-core'
import type { RumSessionManagerMock, TestSetupBuilder } from '../../../test'
import { createPerformanceEntry, createRumSessionManagerMock, mockPerformanceObserver, setup } from '../../../test'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import { RumEventType } from '../../rawRumEvent.types'
import { LifeCycleEventType } from '../lifeCycle'
import { startLongTaskCollection } from './longTaskCollection'

describe('long task collection', () => {
  let setupBuilder: TestSetupBuilder
  let sessionManager: RumSessionManagerMock
  let trackLongTasks: boolean

  beforeEach(() => {
    trackLongTasks = true
    sessionManager = createRumSessionManagerMock()
    setupBuilder = setup()
      .withSessionManager(sessionManager)
      .beforeBuild(({ lifeCycle, configuration }) => {
        startLongTaskCollection(lifeCycle, { ...configuration, trackLongTasks })
      })
  })

  it('should only listen to long task performance entry', () => {
    const { notifyPerformanceEntries } = mockPerformanceObserver()
    const { lifeCycle, rawRumEvents } = setupBuilder.build()

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.NAVIGATION)])
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LONG_TASK),
      createPerformanceEntry(RumPerformanceEntryType.PAINT),
    ])

    expect(rawRumEvents.length).toBe(1)
  })

  it('should collect when trackLongTasks=true', () => {
    trackLongTasks = true
    const { lifeCycle, rawRumEvents } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LONG_TASK),
    ])
    expect(rawRumEvents.length).toBe(1)
  })

  it('should not collect when trackLongTasks=false', () => {
    trackLongTasks = false
    const { lifeCycle, rawRumEvents } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LONG_TASK),
    ])
    expect(rawRumEvents.length).toBe(0)
  })

  it('should create raw rum event from performance entry', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
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
