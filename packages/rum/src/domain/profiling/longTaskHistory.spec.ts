import { relativeToClocks, type Duration, type RelativeTime } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType, RumEventType, RumPerformanceEntryType } from '@datadog/browser-rum-core'
import { createRawRumEvent } from '@datadog/browser-rum-core/test'
import { createLongTaskHistory } from './longTaskHistory'

describe('longTaskHistory', () => {
  let lifeCycle: LifeCycle

  beforeEach(() => {
    lifeCycle = new LifeCycle()
  })

  const fakeDomainContext = {
    performanceEntry: {} as PerformanceEntry,
  }

  describe('createLongTaskHistory', () => {
    it('should create a history with the correct expire delay', () => {
      const history = createLongTaskHistory(lifeCycle)
      expect(history).toBeDefined()
    })

    it('should add long task IDs to history when RAW_RUM_EVENT_COLLECTED is triggered with long_task event', () => {
      const history = createLongTaskHistory(lifeCycle)

      const startClocks = relativeToClocks(10 as RelativeTime)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, {
          long_task: {
            id: 'long-task-123',
          },
        }),
        startClocks,
        duration: 20 as Duration,
        domainContext: fakeDomainContext,
      })

      expect(history.findAll(5 as RelativeTime, 30 as RelativeTime)).toEqual([
        {
          id: 'long-task-123',
          startClocks,
          duration: 20 as Duration,
          entryType: RumPerformanceEntryType.LONG_TASK,
        },
      ])
    })

    it('should not add events to history for non-long_task events', () => {
      const history = createLongTaskHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW, {
          view: {
            id: 'view-123',
          },
        }),
        startClocks: relativeToClocks(50 as RelativeTime),
        duration: 10 as Duration,
        domainContext: { location: window.location },
      })

      expect(history.findAll(40 as RelativeTime, 30 as RelativeTime)).toEqual([])
    })

    it('should store multiple long task IDs with their time ranges', () => {
      const history = createLongTaskHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, {
          long_task: {
            id: 'long-task-1',
          },
        }),
        startClocks: relativeToClocks(10 as RelativeTime),
        duration: 20 as Duration,
        domainContext: fakeDomainContext,
      })

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, {
          long_task: {
            id: 'long-task-2',
          },
        }),
        startClocks: relativeToClocks(50 as RelativeTime),
        duration: 30 as Duration,
        domainContext: fakeDomainContext,
      })

      expect(history.findAll(5 as RelativeTime, 30 as RelativeTime).map((longTask) => longTask.id)).toEqual([
        'long-task-1',
      ])
      expect(history.findAll(45 as RelativeTime, 40 as RelativeTime).map((longTask) => longTask.id)).toEqual([
        'long-task-2',
      ])
      expect(history.findAll(0 as RelativeTime, 100 as RelativeTime).map((longTask) => longTask.id)).toEqual([
        'long-task-2',
        'long-task-1',
      ])
    })

    it('should handle overlapping long task time ranges', () => {
      const history = createLongTaskHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, {
          long_task: {
            id: 'long-task-1',
          },
        }),
        startClocks: relativeToClocks(10 as RelativeTime),
        duration: 40 as Duration,
        domainContext: fakeDomainContext,
      })

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, {
          long_task: {
            id: 'long-task-2',
          },
        }),
        startClocks: relativeToClocks(30 as RelativeTime),
        duration: 40 as Duration,
        domainContext: fakeDomainContext,
      })

      expect(history.findAll(35 as RelativeTime, 20 as RelativeTime).map((longTask) => longTask.id)).toEqual([
        'long-task-2',
        'long-task-1',
      ])
    })
  })
})
