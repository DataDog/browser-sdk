import { setup, TestSetupBuilder } from '../../../../test/specHelper'
import { RumPerformanceEntry } from '../../../browser/performanceCollection'
import { RumEventType } from '../../../rawRumEvent.types'
import { LifeCycleEventType } from '../../lifeCycle'
import { startLongTaskCollection } from './longTaskCollection'

describe('long task collection', () => {
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    setupBuilder = setup()
      .withConfiguration({
        isEnabled: () => true,
      })
      .beforeBuild(({ lifeCycle }) => {
        startLongTaskCollection(lifeCycle)
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
      long_task: {
        duration: 100 * 1e6,
      },
      type: RumEventType.LONG_TASK,
    })
  })
})
