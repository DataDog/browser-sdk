import { noop, relativeToClocks, type Duration, type RelativeTime } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType, RumEventType } from '@datadog/browser-rum-core'
import { createRawRumEvent } from '@datadog/browser-rum-core/test'
import { createActionHistory } from './actionHistory'

describe('actionHistory', () => {
  let lifeCycle: LifeCycle

  beforeEach(() => {
    lifeCycle = new LifeCycle()
  })

  const fakeDomainContext = {
    performanceEntry: {} as PerformanceEntry,
  }

  describe('createActionHistory', () => {
    it('should create a history', () => {
      const history = createActionHistory(lifeCycle)
      expect(history).toBeDefined()
    })

    it('should add action information to history when RAW_RUM_EVENT_COLLECTED is triggered with action event', () => {
      const history = createActionHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION, {
          action: {
            id: 'action-123',
            duration: 20 as Duration,
          },
        }),
        startClocks: relativeToClocks(10 as RelativeTime),
        duration: 20 as Duration,
        domainContext: fakeDomainContext,
      })

      expect(history.findAll(5 as RelativeTime, 30 as RelativeTime)).toEqual([
        {
          id: 'action-123',
          label: '',
          startClocks: relativeToClocks(10 as RelativeTime),
          duration: 20 as Duration,
        },
      ])
    })

    it('should not add events to history for non-action events', () => {
      const history = createActionHistory(lifeCycle)

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

    it('should store multiple action IDs with their time ranges', () => {
      const history = createActionHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION, {
          action: {
            id: 'action-1',
            duration: 20 as Duration,
          },
        }),
        startClocks: relativeToClocks(10 as RelativeTime),
        duration: 20 as Duration,
        domainContext: fakeDomainContext,
      })

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION, {
          action: {
            id: 'action-2',
            duration: 30 as Duration,
          },
        }),
        startClocks: relativeToClocks(50 as RelativeTime),
        duration: 30 as Duration,
        domainContext: fakeDomainContext,
      })

      expect(history.findAll(5 as RelativeTime, 30 as RelativeTime).map((action) => action.id)).toEqual(['action-1'])
      expect(history.findAll(45 as RelativeTime, 40 as RelativeTime).map((action) => action.id)).toEqual(['action-2'])
      expect(history.findAll(0 as RelativeTime, 100 as RelativeTime).map((action) => action.id)).toEqual([
        'action-2',
        'action-1',
      ])
    })

    it('should handle overlapping action time ranges', () => {
      const history = createActionHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION, {
          action: {
            id: 'action-1',
            duration: 40 as Duration,
          },
        }),
        startClocks: relativeToClocks(10 as RelativeTime),
        duration: 40 as Duration,
        domainContext: fakeDomainContext,
      })

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION, {
          action: {
            id: 'action-2',
            duration: 40 as Duration,
          },
        }),
        startClocks: relativeToClocks(30 as RelativeTime),
        duration: 40 as Duration,
        domainContext: fakeDomainContext,
      })

      expect(history.findAll(35 as RelativeTime, 20 as RelativeTime).map((action) => action.id)).toEqual([
        'action-2',
        'action-1',
      ])
    })

    it('should add a action to the history with duration 0 when ACTION_STARTED is triggered', () => {
      const history = createActionHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.ACTION_STARTED, {
        key: 'action-1',
        id: 'action-1',
        data: { name: 'action-1' },
        startClocks: relativeToClocks(10 as RelativeTime),
        historyEntry: {
          startTime: 10 as RelativeTime,
          endTime: 10 as RelativeTime,
          value: 'action-1',
          remove: noop,
          close: noop,
        },
      })

      const matchingActions = history.findAll(10 as RelativeTime, 10 as RelativeTime)

      expect(matchingActions[0].id).toEqual('action-1')
      expect(matchingActions[0].duration).toEqual(0 as Duration)
    })

    it('should add a action to the history when ACTION_STARTED is triggered, and close it when RAW_RUM_EVENT_COLLECTED is triggered', () => {
      const history = createActionHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.ACTION_STARTED, {
        key: 'action-1',
        id: 'action-1',
        data: { name: 'action-1' },
        startClocks: relativeToClocks(10 as RelativeTime),
        historyEntry: {
          startTime: 10 as RelativeTime,
          endTime: 10 as RelativeTime,
          value: 'action-1',
          remove: noop,
          close: noop,
        },
      })

      expect(history.findAll(10 as RelativeTime, 10 as RelativeTime).map((action) => action.id)).toEqual(['action-1'])

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION, {
          action: {
            id: 'action-1',
            duration: 20 as Duration,
          },
        }),
        startClocks: relativeToClocks(10 as RelativeTime),
        duration: 20 as Duration,
        domainContext: fakeDomainContext,
      })

      const matchingActions = history.findAll(10 as RelativeTime, 30 as RelativeTime)

      expect(matchingActions[0].id).toEqual('action-1')
      expect(matchingActions[0].duration).toEqual(20 as Duration)
    })

    it('should be able to handle multiple actions being started and stopped', () => {
      const history = createActionHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.ACTION_STARTED, {
        key: 'action-1',
        id: 'action-1',
        data: { name: 'action-1' },
        startClocks: relativeToClocks(10 as RelativeTime),
        historyEntry: {
          startTime: 10 as RelativeTime,
          endTime: 10 as RelativeTime,
          value: 'action-1',
          remove: noop,
          close: noop,
        },
      })

      lifeCycle.notify(LifeCycleEventType.ACTION_STARTED, {
        key: 'action-2',
        id: 'action-2',
        data: { name: 'action-2' },
        startClocks: relativeToClocks(10 as RelativeTime),
        historyEntry: {
          startTime: 10 as RelativeTime,
          endTime: 10 as RelativeTime,
          value: 'action-2',
          remove: noop,
          close: noop,
        },
      })

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION, {
          action: {
            id: 'action-2',
            duration: 20 as Duration,
          },
        }),
        startClocks: relativeToClocks(10 as RelativeTime),
        duration: 20 as Duration,
        domainContext: fakeDomainContext,
      })

      let matchingActions = history.findAll(10 as RelativeTime, 30 as RelativeTime)

      expect(matchingActions.map((action) => action.id)).toEqual(['action-2', 'action-1'])

      expect(matchingActions.map((action) => action.duration)).toEqual([20 as Duration, 0 as Duration])

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.ACTION, {
          action: {
            id: 'action-1',
            duration: 20 as Duration,
          },
        }),
        startClocks: relativeToClocks(10 as RelativeTime),
        duration: 20 as Duration,
        domainContext: fakeDomainContext,
      })

      matchingActions = history.findAll(10 as RelativeTime, 30 as RelativeTime)

      expect(matchingActions.map((action) => action.id)).toEqual(['action-2', 'action-1'])

      expect(matchingActions.map((action) => action.duration)).toEqual([20 as Duration, 20 as Duration])
    })
  })
})
