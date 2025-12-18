import type { Duration, RelativeTime } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType, RumEventType } from '@datadog/browser-rum-core'
import { createRawRumEvent } from '../../../../rum-core/test'
import { createLongTaskIdHistory } from './longTaskIdHistory'

describe('longTaskIdHistory', () => {
  let lifeCycle: LifeCycle

  beforeEach(() => {
    lifeCycle = new LifeCycle()
  })

  const fakeDomainContext = {
    performanceEntry: {} as PerformanceEntry,
  }

  describe('createLongTaskIdHistory', () => {
    it('should create a history with the correct expire delay', () => {
      const history = createLongTaskIdHistory(lifeCycle)
      expect(history).toBeDefined()
    })

    it('should add long task IDs to history when RAW_RUM_EVENT_COLLECTED is triggered with long_task event', () => {
      const history = createLongTaskIdHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, {
          long_task: {
            id: 'long-task-123',
          },
        }),
        startTime: 10 as RelativeTime,
        duration: 20 as Duration,
        domainContext: fakeDomainContext,
      })

      expect(history.findAll(5 as RelativeTime, 30 as RelativeTime)).toEqual(['long-task-123'])
    })

    it('should not add events to history for non-long_task events', () => {
      const history = createLongTaskIdHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VIEW, {
          view: {
            id: 'view-123',
          },
        }),
        startTime: 50 as RelativeTime,
        duration: 10 as Duration,
        domainContext: { location: window.location },
      })

      expect(history.findAll(40 as RelativeTime, 30 as RelativeTime)).toEqual([])
    })

    it('should store multiple long task IDs with their time ranges', () => {
      const history = createLongTaskIdHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, {
          long_task: {
            id: 'long-task-1',
          },
        }),
        startTime: 10 as RelativeTime,
        duration: 20 as Duration,
        domainContext: fakeDomainContext,
      })

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, {
          long_task: {
            id: 'long-task-2',
          },
        }),
        startTime: 50 as RelativeTime,
        duration: 30 as Duration,
        domainContext: fakeDomainContext,
      })

      expect(history.findAll(5 as RelativeTime, 30 as RelativeTime)).toEqual(['long-task-1'])
      expect(history.findAll(45 as RelativeTime, 40 as RelativeTime)).toEqual(['long-task-2'])
      expect(history.findAll(0 as RelativeTime, 100 as RelativeTime)).toEqual(['long-task-2', 'long-task-1'])
    })

    it('should handle overlapping long task time ranges', () => {
      const history = createLongTaskIdHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, {
          long_task: {
            id: 'long-task-1',
          },
        }),
        startTime: 10 as RelativeTime,
        duration: 40 as Duration,
        domainContext: fakeDomainContext,
      })

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.LONG_TASK, {
          long_task: {
            id: 'long-task-2',
          },
        }),
        startTime: 30 as RelativeTime,
        duration: 40 as Duration,
        domainContext: fakeDomainContext,
      })

      expect(history.findAll(35 as RelativeTime, 20 as RelativeTime)).toEqual(['long-task-2', 'long-task-1'])
    })
  })
})
