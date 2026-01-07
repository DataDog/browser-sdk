import type { RelativeTime, TimeStamp } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { RumEventType } from '../../rawRumEvent.types'
import type { ActionTracker, TrackedAction } from './trackAction'
import { startActionTracker } from './trackAction'

describe('trackAction', () => {
  let lifeCycle: LifeCycle
  let actionTracker: ActionTracker
  let clock: Clock

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    clock = mockClock()
    actionTracker = startActionTracker(lifeCycle)
    registerCleanupTask(() => actionTracker.stop())
  })

  describe('createTrackedAction', () => {
    it('should generate a unique action ID', () => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      const trackedAction = actionTracker.createTrackedAction(startClocks)

      expect(trackedAction.id).toBeDefined()
      expect(typeof trackedAction.id).toBe('string')
      expect(trackedAction.id.length).toBeGreaterThan(0)
    })

    it('should create distinct IDs for each tracked action', () => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      const action1 = actionTracker.createTrackedAction(startClocks)
      const action2 = actionTracker.createTrackedAction(startClocks)

      expect(action1.id).not.toBe(action2.id)
    })

    it('should store the start clocks', () => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      const trackedAction = actionTracker.createTrackedAction(startClocks)

      expect(trackedAction.startClocks).toBe(startClocks)
    })

    it('should initialize event counts to zero', () => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      const trackedAction = actionTracker.createTrackedAction(startClocks)

      expect(trackedAction.eventCounts.errorCount).toBe(0)
      expect(trackedAction.eventCounts.resourceCount).toBe(0)
      expect(trackedAction.eventCounts.longTaskCount).toBe(0)
    })
  })

  describe('event counting', () => {
    let trackedAction: TrackedAction

    beforeEach(() => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      trackedAction = actionTracker.createTrackedAction(startClocks)
    })

    it('should count errors associated with the action', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ERROR,
        action: { id: trackedAction.id },
        error: { message: 'test error' },
      } as any)

      expect(trackedAction.eventCounts.errorCount).toBe(1)
    })

    it('should count resources associated with the action', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.RESOURCE,
        action: { id: trackedAction.id },
        resource: { type: 'fetch' },
      } as any)

      expect(trackedAction.eventCounts.resourceCount).toBe(1)
    })

    it('should count long tasks associated with the action', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.LONG_TASK,
        action: { id: trackedAction.id },
        long_task: { duration: 100 },
      } as any)

      expect(trackedAction.eventCounts.longTaskCount).toBe(1)
    })

    it('should count events when action ID is in an array', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ERROR,
        action: { id: ['other-id', trackedAction.id] },
        error: { message: 'test error' },
      } as any)

      expect(trackedAction.eventCounts.errorCount).toBe(1)
    })

    it('should not count events for other actions', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ERROR,
        action: { id: 'other-action-id' },
        error: { message: 'test error' },
      } as any)

      expect(trackedAction.eventCounts.errorCount).toBe(0)
    })

    it('should stop counting events after action is stopped', () => {
      trackedAction.stop(200 as RelativeTime)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ERROR,
        action: { id: trackedAction.id },
        error: { message: 'test error' },
      } as any)

      expect(trackedAction.eventCounts.errorCount).toBe(0)
    })
  })

  describe('findActionId', () => {
    it('should return undefined when no actions are tracked', () => {
      expect(actionTracker.findActionId()).toBeUndefined()
    })

    it('should return the action ID when one action is active', () => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      const trackedAction = actionTracker.createTrackedAction(startClocks)

      expect(actionTracker.findActionId()).toBe(trackedAction.id)
    })

    it('should return undefined for actions that were stopped without end time', () => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      const trackedAction = actionTracker.createTrackedAction(startClocks)

      trackedAction.stop()

      expect(actionTracker.findActionId()).toBeUndefined()
    })

    it('should return the action ID for events within the action time range', () => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      const trackedAction = actionTracker.createTrackedAction(startClocks)

      trackedAction.stop(200 as RelativeTime)

      expect(actionTracker.findActionId(150 as RelativeTime)).toBe(trackedAction.id)
    })

    it('should return undefined for events outside the action time range', () => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      const trackedAction = actionTracker.createTrackedAction(startClocks)

      trackedAction.stop(200 as RelativeTime)

      expect(actionTracker.findActionId(250 as RelativeTime)).toBeUndefined()
    })

    it('should return array of IDs when multiple actions are active', () => {
      const action1 = actionTracker.createTrackedAction({ relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp })
      const action2 = actionTracker.createTrackedAction({ relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp })

      const result = actionTracker.findActionId()

      expect(Array.isArray(result)).toBeTrue()
      expect(result).toContain(action1.id)
      expect(result).toContain(action2.id)
    })
  })

  describe('discard', () => {
    it('should remove the action from history', () => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      const trackedAction = actionTracker.createTrackedAction(startClocks)

      trackedAction.discard()

      expect(actionTracker.findActionId()).toBeUndefined()
    })

    it('should stop counting events after discard', () => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      const trackedAction = actionTracker.createTrackedAction(startClocks)

      trackedAction.discard()

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ERROR,
        action: { id: trackedAction.id },
        error: { message: 'test error' },
      } as any)

      expect(trackedAction.eventCounts.errorCount).toBe(0)
    })
  })

  describe('session renewal', () => {
    it('should clear all action IDs on session renewal', () => {
      const action1 = actionTracker.createTrackedAction({ relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp })
      const action2 = actionTracker.createTrackedAction({ relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp })

      expect(actionTracker.findActionId()).toBeDefined()

      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      expect(actionTracker.findActionId()).toBeUndefined()
    })

    it('should stop event counting on session renewal', () => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      const trackedAction = actionTracker.createTrackedAction(startClocks)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ERROR,
        action: { id: trackedAction.id },
        error: { message: 'first error' },
      } as any)

      expect(trackedAction.eventCounts.errorCount).toBe(1)

      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ERROR,
        action: { id: trackedAction.id },
        error: { message: 'second error' },
      } as any)

      expect(trackedAction.eventCounts.errorCount).toBe(1)
    })
  })

  describe('stop', () => {
    it('should clean up all resources', () => {
      const trackedAction = actionTracker.createTrackedAction({
        relative: 100 as RelativeTime,
        timeStamp: 1000 as TimeStamp,
      })

      expect(actionTracker.findActionId()).toBe(trackedAction.id)

      actionTracker.stop()

      expect(actionTracker.findActionId()).toBeUndefined()
    })

    it('should stop all active event count subscriptions', () => {
      const trackedAction = actionTracker.createTrackedAction({
        relative: 100 as RelativeTime,
        timeStamp: 1000 as TimeStamp,
      })

      actionTracker.stop()

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ERROR,
        action: { id: trackedAction.id },
        error: { message: 'test error' },
      } as any)

      expect(trackedAction.eventCounts.errorCount).toBe(0)
    })
  })
})
