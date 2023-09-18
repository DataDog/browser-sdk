import type { RelativeTime, ServerDuration } from '@datadog/browser-core'
import type { RumSessionManagerMock, TestSetupBuilder } from '../../../test'
import { createPerformanceEntry, createRumSessionManagerMock, setup } from '../../../test'
import { RumPerformanceEntryType, type RumPerformanceEntry } from '../../browser/performanceCollection'
import { RumEventType } from '../../rawRumEvent.types'
import { LifeCycleEventType } from '../lifeCycle'
import { startLongTaskCollection } from './longTaskCollection'

describe('long task collection', () => {
  let setupBuilder: TestSetupBuilder
  let sessionManager: RumSessionManagerMock
  beforeEach(() => {
    sessionManager = createRumSessionManagerMock()
    setupBuilder = setup()
      .withSessionManager(sessionManager)
      .beforeBuild(({ lifeCycle, sessionManager }) => {
        startLongTaskCollection(lifeCycle, sessionManager)
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should only listen to long task performance entry', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LONG_TASK),
      createPerformanceEntry(RumPerformanceEntryType.NAVIGATION),
      createPerformanceEntry(RumPerformanceEntryType.RESOURCE),
      createPerformanceEntry(RumPerformanceEntryType.PAINT),
    ] as RumPerformanceEntry[])

    expect(rawRumEvents.length).toBe(1)
  })

  it('should only collect when session allows long tasks', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()

    sessionManager.setLongTaskAllowed(true)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LONG_TASK),
    ])
    expect(rawRumEvents.length).toBe(1)

    sessionManager.setLongTaskAllowed(false)
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      createPerformanceEntry(RumPerformanceEntryType.LONG_TASK),
    ])
    expect(rawRumEvents.length).toBe(1)
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
      performanceEntry: { name: 'self', duration: 100, entryType: 'longtask', startTime: 1234 },
    })
  })
})
