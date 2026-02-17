import { relativeToClocks, type Duration, type RelativeTime } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType, RumEventType } from '@datadog/browser-rum-core'
import { createRawRumEvent } from '@datadog/browser-rum-core/test'
import { createVitalHistory } from './vitalHistory'

describe('vitalHistory', () => {
  let lifeCycle: LifeCycle

  beforeEach(() => {
    lifeCycle = new LifeCycle()
  })

  const fakeDomainContext = {
    performanceEntry: {} as PerformanceEntry,
  }

  describe('createVitalHistory', () => {
    it('should create a history', () => {
      const history = createVitalHistory(lifeCycle)
      expect(history).toBeDefined()
    })

    it('should add vital information to history when RAW_RUM_EVENT_COLLECTED is triggered with vital event', () => {
      const history = createVitalHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VITAL, {
          vital: {
            id: 'vital-123',
            name: 'vital-name',
            duration: 20 as Duration,
          },
        }),
        startClocks: relativeToClocks(10 as RelativeTime),
        duration: 20 as Duration,
        domainContext: fakeDomainContext,
      })

      expect(history.findAll(5 as RelativeTime, 30 as RelativeTime)).toEqual([
        {
          id: 'vital-123',
          startClocks: relativeToClocks(10 as RelativeTime),
          duration: 20 as Duration,
          label: 'vital-name',
        },
      ])
    })

    it('should not add events to history for non-vital events', () => {
      const history = createVitalHistory(lifeCycle)

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

    it('should store multiple vital IDs with their time ranges', () => {
      const history = createVitalHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VITAL, {
          vital: {
            id: 'vital-1',
            name: 'vital-name-1',
            duration: 20 as Duration,
          },
        }),
        startClocks: relativeToClocks(10 as RelativeTime),
        duration: 20 as Duration,
        domainContext: fakeDomainContext,
      })

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VITAL, {
          vital: {
            id: 'vital-2',
            name: 'vital-name-2',
            duration: 30 as Duration,
          },
        }),
        startClocks: relativeToClocks(50 as RelativeTime),
        duration: 30 as Duration,
        domainContext: fakeDomainContext,
      })

      expect(history.findAll(5 as RelativeTime, 30 as RelativeTime).map((vital) => vital.id)).toEqual(['vital-1'])
      expect(history.findAll(45 as RelativeTime, 40 as RelativeTime).map((vital) => vital.id)).toEqual(['vital-2'])
      expect(history.findAll(0 as RelativeTime, 100 as RelativeTime).map((vital) => vital.id)).toEqual([
        'vital-2',
        'vital-1',
      ])
    })

    it('should handle overlapping vital time ranges', () => {
      const history = createVitalHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VITAL, {
          vital: {
            id: 'vital-1',
            name: 'vital-name-1',
            duration: 40 as Duration,
          },
        }),
        startClocks: relativeToClocks(10 as RelativeTime),
        duration: 40 as Duration,
        domainContext: fakeDomainContext,
      })

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VITAL, {
          vital: {
            id: 'vital-2',
            name: 'vital-name-2',
            duration: 40 as Duration,
          },
        }),
        startClocks: relativeToClocks(30 as RelativeTime),
        duration: 40 as Duration,
        domainContext: fakeDomainContext,
      })

      expect(history.findAll(35 as RelativeTime, 20 as RelativeTime).map((vital) => vital.id)).toEqual([
        'vital-2',
        'vital-1',
      ])
    })

    it('should add a vital to the history with duration 0 when VITAL_STARTED is triggered', () => {
      const history = createVitalHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.VITAL_STARTED, {
        id: 'vital-1',
        name: 'vital-name-1',
        startClocks: relativeToClocks(10 as RelativeTime),
      })

      const matchingVitals = history.findAll(10 as RelativeTime, 10 as RelativeTime)

      expect(matchingVitals[0].id).toEqual('vital-1')
      expect(matchingVitals[0].duration).toEqual(0 as Duration)
    })

    it('should add a vital to the history when VITAL_STARTED is triggered, and close it when RAW_RUM_EVENT_COLLECTED is triggered', () => {
      const history = createVitalHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.VITAL_STARTED, {
        id: 'vital-1',
        name: 'vital-name-1',
        startClocks: relativeToClocks(10 as RelativeTime),
      })

      expect(history.findAll(10 as RelativeTime, 10 as RelativeTime).map((vital) => vital.id)).toEqual(['vital-1'])

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VITAL, {
          vital: {
            id: 'vital-1',
            name: 'vital-name-1',
            duration: 20 as Duration,
          },
        }),
        startClocks: relativeToClocks(10 as RelativeTime),
        duration: 20 as Duration,
        domainContext: fakeDomainContext,
      })

      const matchingVitals = history.findAll(10 as RelativeTime, 30 as RelativeTime)

      expect(matchingVitals[0].id).toEqual('vital-1')
      expect(matchingVitals[0].duration).toEqual(20 as Duration)
    })

    it('should be able to handle multiple vitals being started and stopped', () => {
      const history = createVitalHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.VITAL_STARTED, {
        id: 'vital-1',
        name: 'vital-name-1',
        startClocks: relativeToClocks(10 as RelativeTime),
      })

      lifeCycle.notify(LifeCycleEventType.VITAL_STARTED, {
        id: 'vital-2',
        name: 'vital-name-2',
        startClocks: relativeToClocks(10 as RelativeTime),
      })

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VITAL, {
          vital: {
            id: 'vital-2',
            name: 'vital-name-2',
            duration: 20 as Duration,
          },
        }),
        startClocks: relativeToClocks(10 as RelativeTime),
        duration: 20 as Duration,
        domainContext: fakeDomainContext,
      })

      let matchingVitals = history.findAll(10 as RelativeTime, 30 as RelativeTime)

      expect(matchingVitals.map((vital) => vital.id)).toEqual(['vital-2', 'vital-1'])

      expect(matchingVitals.map((vital) => vital.duration)).toEqual([20 as Duration, 0 as Duration])

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VITAL, {
          vital: {
            id: 'vital-1',
            name: 'vital-name-1',
            duration: 20 as Duration,
          },
        }),
        startClocks: relativeToClocks(10 as RelativeTime),
        duration: 20 as Duration,
        domainContext: fakeDomainContext,
      })

      matchingVitals = history.findAll(10 as RelativeTime, 30 as RelativeTime)

      expect(matchingVitals.map((vital) => vital.id)).toEqual(['vital-2', 'vital-1'])

      expect(matchingVitals.map((vital) => vital.duration)).toEqual([20 as Duration, 20 as Duration])
    })
  })
})
