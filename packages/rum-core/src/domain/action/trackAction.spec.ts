import type { RelativeTime, TimeStamp } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { RumEventType } from '../../rawRumEvent.types'
import type { ActionTracker, TrackedAction } from './trackAction'
import { startActionTracker } from './trackAction'

describe('trackAction', () => {
  let lifeCycle: LifeCycle
  let actionTracker: ActionTracker

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    actionTracker = startActionTracker(lifeCycle)
    registerCleanupTask(() => actionTracker.stop())
  })

  describe('createTrackedAction', () => {
    it('should have an ID, start clocks and event counts to zero', () => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      const trackedAction = actionTracker.createTrackedAction(startClocks)

      expect(trackedAction.id).toBeDefined()
      expect(trackedAction.startClocks).toBe(startClocks)
      expect(trackedAction.counts.errorCount).toBe(0)
      expect(trackedAction.counts.resourceCount).toBe(0)
      expect(trackedAction.counts.longTaskCount).toBe(0)
    })

    it('should create distinct IDs for each tracked action', () => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      const action1 = actionTracker.createTrackedAction(startClocks)
      const action2 = actionTracker.createTrackedAction(startClocks)

      expect(action1.id).not.toBe(action2.id)
    })
  })

  describe('event counting', () => {
    let trackedAction: TrackedAction

    beforeEach(() => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      trackedAction = actionTracker.createTrackedAction(startClocks)
    })

    it('should count child events associated with the action', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ERROR,
        action: { id: trackedAction.id },
        error: { message: 'test error' },
      } as any)

      expect(trackedAction.counts.errorCount).toBe(1)
    })

    it('should not count child events unrelated to the action', () => {
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ERROR,
        action: { id: 'other-action-id' },
        error: { message: 'test error' },
      } as any)

      expect(trackedAction.counts.errorCount).toBe(0)
    })

    it('should stop counting events after action is stopped', () => {
      trackedAction.stop(200 as RelativeTime)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ERROR,
        action: { id: trackedAction.id },
        error: { message: 'test error' },
      } as any)

      expect(trackedAction.counts.errorCount).toBe(0)
    })
  })

  describe('findActionId', () => {
    it('should return undefined when no actions are tracked', () => {
      expect(actionTracker.findActionId()).toBeUndefined()
    })

    it('should return the action ID when one action is active', () => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      const trackedAction = actionTracker.createTrackedAction(startClocks)

      expect(actionTracker.findActionId()).toEqual([trackedAction.id])
    })

    it('should return undefined for actions that were stopped without end time', () => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      const trackedAction = actionTracker.createTrackedAction(startClocks)

      trackedAction.stop(200 as RelativeTime)

      expect(actionTracker.findActionId()).toBeUndefined()
    })

    it('should return the action ID for events within the action time range', () => {
      const startClocks = { relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp }
      const trackedAction = actionTracker.createTrackedAction(startClocks)

      trackedAction.stop(200 as RelativeTime)

      expect(actionTracker.findActionId(150 as RelativeTime)).toEqual([trackedAction.id])
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

      expect(trackedAction.counts.errorCount).toBe(0)
    })
  })

  describe('session renewal', () => {
    it('should clear all action IDs on session renewal', () => {
      actionTracker.createTrackedAction({ relative: 100 as RelativeTime, timeStamp: 1000 as TimeStamp })

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

      expect(trackedAction.counts.errorCount).toBe(1)

      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ERROR,
        action: { id: trackedAction.id },
        error: { message: 'second error' },
      } as any)

      expect(trackedAction.counts.errorCount).toBe(1)
    })
  })

  describe('stop', () => {
    it('should clean up all resources', () => {
      const trackedAction = actionTracker.createTrackedAction({
        relative: 100 as RelativeTime,
        timeStamp: 1000 as TimeStamp,
      })

      expect(actionTracker.findActionId()).toEqual([trackedAction.id])

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

      expect(trackedAction.counts.errorCount).toBe(0)
    })
  })
})
