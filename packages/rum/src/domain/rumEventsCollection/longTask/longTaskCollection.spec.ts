import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RumPerformanceEntry } from '../../../browser/performanceCollection'
import { RumEventCategory } from '../../../index'
import { RumEventType } from '../../../typesV2'
import { LifeCycleEventType } from '../../lifeCycle'
import { startLongTaskCollection } from './longTaskCollection'

describe('long task collection', () => {
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    setupBuilder = setup()
      .withConfiguration({
        isEnabled: () => false,
      })
      .beforeBuild(({ lifeCycle, configuration }) => {
        startLongTaskCollection(lifeCycle, configuration)
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should only listen to long task performance entry', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    ;[
      { duration: 100, entryType: 'longtask', startTime: 1234 },
      { duration: 100, entryType: 'navigation', startTime: 1234 },
      { duration: 100, entryType: 'resource', startTime: 1234 },
      { duration: 100, entryType: 'paint', startTime: 1234 },
    ].forEach((entry) => {
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, entry as RumPerformanceEntry)
    })
    expect(rawRumEvents.length).toBe(1)
  })

  it('should create raw rum event from performance entry', () => {
    const { lifeCycle, rawRumEvents } = setupBuilder.build()
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, {
      duration: 100,
      entryType: 'longtask',
      startTime: 1234,
    })

    expect(rawRumEvents[0].startTime).toBe(1234)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      duration: 100 * 1e6,
      evt: {
        category: RumEventCategory.LONG_TASK,
      },
    })
  })
})

describe('long task collection v2', () => {
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    setupBuilder = setup()
      .withConfiguration({
        isEnabled: () => true,
      })
      .beforeBuild(({ lifeCycle, configuration }) => {
        startLongTaskCollection(lifeCycle, configuration)
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should only listen to long task performance entry', () => {
    const { lifeCycle, rawRumEventsV2 } = setupBuilder.build()
    ;[
      { duration: 100, entryType: 'longtask', startTime: 1234 },
      { duration: 100, entryType: 'navigation', startTime: 1234 },
      { duration: 100, entryType: 'resource', startTime: 1234 },
      { duration: 100, entryType: 'paint', startTime: 1234 },
    ].forEach((entry) => {
      lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, entry as RumPerformanceEntry)
    })
    expect(rawRumEventsV2.length).toBe(1)
  })

  it('should create raw rum event from performance entry', () => {
    const { lifeCycle, rawRumEventsV2 } = setupBuilder.build()
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRY_COLLECTED, {
      duration: 100,
      entryType: 'longtask',
      startTime: 1234,
    })

    expect(rawRumEventsV2[0].startTime).toBe(1234)
    expect(rawRumEventsV2[0].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      longTask: {
        duration: 100 * 1e6,
      },
      type: RumEventType.LONG_TASK,
    })
  })
})
