import type { RelativeTime, ServerDuration } from '@datadog/browser-core'
import {
  collectAndValidateRawRumEvents,
  createPerformanceEntry,
  mockPerformanceObserver,
  mockRumConfiguration,
  mockFeatureFlagContexts,
} from '../../../test'
import type { FeatureFlagContexts } from '../contexts/featureFlagContext'
import type { RumPerformanceEntry } from '../../browser/performanceObservable'
import { RumPerformanceEntryType } from '../../browser/performanceObservable'
import type { RawRumEvent } from '../../rawRumEvent.types'
import { RumEventType, RumLongTaskEntryType } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycle } from '../lifeCycle'
import { startLongTaskCollection } from './longTaskCollection'

describe('long task collection', () => {
  let lifeCycle = new LifeCycle()
  let rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>> = []
  let notifyPerformanceEntries: (entries: RumPerformanceEntry[]) => void
  const partialFeatureFlagContexts: Partial<FeatureFlagContexts> = {}
  const featureFlagContexts = mockFeatureFlagContexts(partialFeatureFlagContexts)

  function setupLongTaskCollection(trackLongTasks = true) {
    ;({ notifyPerformanceEntries } = mockPerformanceObserver())

    lifeCycle = new LifeCycle()
    startLongTaskCollection(lifeCycle, mockRumConfiguration({ trackLongTasks }), featureFlagContexts)

    rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)
  }

  it('should only listen to long task performance entry', () => {
    setupLongTaskCollection()

    notifyPerformanceEntries([
      createPerformanceEntry(RumPerformanceEntryType.NAVIGATION),
      createPerformanceEntry(RumPerformanceEntryType.LONG_TASK),
      createPerformanceEntry(RumPerformanceEntryType.PAINT),
    ])

    expect(rawRumEvents.length).toBe(1)
  })

  it('should collect when trackLongTasks=true', () => {
    setupLongTaskCollection()

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.LONG_TASK)])
    expect(rawRumEvents.length).toBe(1)
  })

  it('should not collect when trackLongTasks=false', () => {
    setupLongTaskCollection(false)

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.LONG_TASK)])

    expect(rawRumEvents.length).toBe(0)
  })

  it('should create raw rum event from performance entry', () => {
    setupLongTaskCollection()
    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.LONG_TASK)])

    expect(rawRumEvents[0].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      date: jasmine.any(Number),
      long_task: {
        id: jasmine.any(String),
        entry_type: RumLongTaskEntryType.LONG_TASK,
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
  it('should include feature flags', () => {
    setupLongTaskCollection()
    spyOn(featureFlagContexts, 'findFeatureFlagEvaluations').and.returnValue({
      'my-longtask-flag': 'test',
    })

    notifyPerformanceEntries([createPerformanceEntry(RumPerformanceEntryType.LONG_TASK)])
    expect(rawRumEvents.length).toBe(1)
    const event = rawRumEvents[0].rawRumEvent
    expect(event.feature_flags).toEqual({
      'my-longtask-flag': 'test',
    })
  })
})
