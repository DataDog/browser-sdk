import { Duration, relativeToClocks, type RelativeTime } from '@datadog/js-core/time'
import { LifeCycle, LifeCycleEventType, RumEventType, VitalType } from '@datadog/browser-rum-core'
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
      const startClocks = relativeToClocks(10 as RelativeTime)

      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VITAL, {
          vital: {
            id: 'vital-123',
            name: 'vital-name',
            duration: 20 as Duration,
          },
        }),
        startClocks,
        duration: 20 as Duration,
        domainContext: fakeDomainContext,
      })

      expect(history.findAll(5 as RelativeTime, 30 as RelativeTime)).toEqual([
        {
          id: 'vital-123',
          type: VitalType.DURATION,
          startClocks,
          duration: 20 as Duration,
          label: 'vital-name',
          operationKey: undefined,
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

    it('should add a vital to the history with duration 0 when DURATION_VITAL_STARTED is triggered', () => {
      const history = createVitalHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.DURATION_VITAL_STARTED, {
        id: 'vital-1',
        name: 'vital-name-1',
        startClocks: relativeToClocks(10 as RelativeTime),
      })

      const matchingVitals = history.findAll(10 as RelativeTime, 10 as RelativeTime)

      expect(matchingVitals[0].id).toEqual('vital-1')
      expect(matchingVitals[0].duration).toBeUndefined()
    })

    it('should add a vital to the history when DURATION_VITAL_STARTED is triggered, and close it when RAW_RUM_EVENT_COLLECTED is triggered', () => {
      const history = createVitalHistory(lifeCycle)

      lifeCycle.notify(LifeCycleEventType.DURATION_VITAL_STARTED, {
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

      lifeCycle.notify(LifeCycleEventType.DURATION_VITAL_STARTED, {
        id: 'vital-1',
        name: 'vital-name-1',
        startClocks: relativeToClocks(10 as RelativeTime),
      })

      lifeCycle.notify(LifeCycleEventType.DURATION_VITAL_STARTED, {
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

      expect(matchingVitals.map((vital) => vital.duration)).toEqual([20 as Duration, undefined])

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

    function notifyOperationStep(
      name: string,
      stepType: 'start' | 'end',
      relativeTime: RelativeTime,
      operationKey?: string
    ) {
      lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
        rawRumEvent: createRawRumEvent(RumEventType.VITAL, {
          vital: {
            id: `${name}-${stepType}`,
            type: VitalType.OPERATION_STEP,
            name,
            step_type: stepType,
            operation_key: operationKey,
          },
        }),
        startClocks: relativeToClocks(relativeTime),
        duration: undefined,
        domainContext: fakeDomainContext,
      })
    }

    it('should add a start operation step to the history with undefined duration', () => {
      const history = createVitalHistory(lifeCycle)

      notifyOperationStep('op-name', 'start', 10 as RelativeTime)

      const vitals = history.findAll(10 as RelativeTime, 10 as Duration)
      expect(vitals.length).toBe(1)
      expect(vitals[0].label).toBe('op-name')
      expect(vitals[0].duration).toBeUndefined()
    })

    it('should not add an end-only operation step to the history', () => {
      const history = createVitalHistory(lifeCycle)

      notifyOperationStep('op-name', 'end', 30 as RelativeTime)

      expect(history.findAll(0 as RelativeTime, 100 as Duration)).toEqual([])
    })

    it('should update the start vital with the correct duration and entry end time when the matching end step arrives', () => {
      const history = createVitalHistory(lifeCycle)

      notifyOperationStep('op-name', 'start', 10 as RelativeTime)
      notifyOperationStep('op-name', 'end', 50 as RelativeTime)

      // This checks that the entry duration was updated too
      const vitals = history.findAll(35 as RelativeTime, 20 as Duration)
      expect(vitals.length).toBe(1)
      expect(vitals[0].label).toBe('op-name')
      expect(vitals[0].duration).toBe(40 as Duration)
    })

    it('should only update the vital whose name matches the end step', () => {
      const history = createVitalHistory(lifeCycle)

      notifyOperationStep('op-a', 'start', 10 as RelativeTime)
      notifyOperationStep('op-b', 'start', 20 as RelativeTime)
      notifyOperationStep('op-a', 'end', 50 as RelativeTime)

      const vitals = history.findAll(0 as RelativeTime, 100 as Duration)
      const opA = vitals.find((v) => v.label === 'op-a')
      const opB = vitals.find((v) => v.label === 'op-b')

      expect(opA?.duration).toBe(40 as Duration)
      expect(opB?.duration).toBeUndefined()
    })

    it('should match start/end by both name and operationKey', () => {
      const history = createVitalHistory(lifeCycle)

      notifyOperationStep('op-name', 'start', 10 as RelativeTime, 'key1')
      notifyOperationStep('op-name', 'start', 20 as RelativeTime, 'key2')
      notifyOperationStep('op-name', 'end', 50 as RelativeTime, 'key1')

      const vitals = history.findAll(0 as RelativeTime, 100 as Duration)
      const key1 = vitals.find((v) => v.operationKey === 'key1')
      const key2 = vitals.find((v) => v.operationKey === 'key2')

      expect(key1?.duration).toBe(40 as Duration)
      expect(key2?.duration).toBeUndefined()
    })

    it('should update both vitals independently when their respective end steps arrive', () => {
      const history = createVitalHistory(lifeCycle)

      notifyOperationStep('op-name', 'start', 10 as RelativeTime, 'key1')
      notifyOperationStep('op-name', 'start', 20 as RelativeTime, 'key2')
      notifyOperationStep('op-name', 'end', 50 as RelativeTime, 'key1')
      notifyOperationStep('op-name', 'end', 80 as RelativeTime, 'key2')

      const vitals = history.findAll(0 as RelativeTime, 100 as Duration)
      const key1 = vitals.find((v) => v.operationKey === 'key1')
      const key2 = vitals.find((v) => v.operationKey === 'key2')

      expect(key1?.duration).toBe(40 as Duration)
      expect(key2?.duration).toBe(60 as Duration)
    })
  })
})
