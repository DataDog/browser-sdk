import type { Duration, ServerDuration } from '@datadog/browser-core'
import { ExperimentalFeature, Observable } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, mockExperimentalFeatures, registerCleanupTask } from '@datadog/browser-core/test'
import { collectAndValidateRawRumEvents, mockRumConfiguration } from '../../../test'
import type { RawRumActionEvent, RawRumEvent } from '../../rawRumEvent.types'
import { RumEventType, ActionType, FrustrationType } from '../../rawRumEvent.types'
import { type RawRumEventCollectedData, LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { createHooks } from '../hooks'
import type { RumMutationRecord } from '../../browser/domMutationObservable'
import { startActionCollection } from './actionCollection'
import type { ActionContexts } from './actionCollection'

describe('trackManualActions', () => {
  const lifeCycle = new LifeCycle()
  let rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>>
  let actionContexts: ActionContexts
  let startAction: ReturnType<typeof startActionCollection>['startAction']
  let stopAction: ReturnType<typeof startActionCollection>['stopAction']
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
    mockExperimentalFeatures([ExperimentalFeature.START_STOP_ACTION])

    const domMutationObservable = new Observable<RumMutationRecord[]>()
    const windowOpenObservable = new Observable<void>()
    const hooks = createHooks()

    const actionCollection = startActionCollection(
      lifeCycle,
      hooks,
      domMutationObservable,
      windowOpenObservable,
      mockRumConfiguration()
    )
    registerCleanupTask(actionCollection.stop)
    startAction = actionCollection.startAction
    stopAction = actionCollection.stopAction
    actionContexts = actionCollection.actionContexts

    rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)
  })

  describe('basic functionality', () => {
    it('should create action with duration from name-based tracking', () => {
      startAction('user_login')
      clock.tick(500)
      stopAction('user_login')

      expect(rawRumEvents).toHaveSize(1)
      expect(rawRumEvents[0].duration).toBe(500 as Duration)
      expect(rawRumEvents[0].rawRumEvent).toEqual(
        jasmine.objectContaining({
          type: RumEventType.ACTION,
          action: jasmine.objectContaining({
            target: { name: 'user_login' },
            type: ActionType.CUSTOM,
          }),
        })
      )
    })

    it('should use consistent action ID from start to collected event', () => {
      startAction('checkout')

      const actionId = actionContexts.findActionId()
      expect(actionId).toBeDefined()

      stopAction('checkout')

      expect(rawRumEvents).toHaveSize(1)
      const actionEvent = rawRumEvents[0].rawRumEvent as RawRumActionEvent
      expect(actionEvent.action.id).toEqual((actionId as string[])[0])
    })

    it('should include loading_time for timed manual actions', () => {
      startAction('checkout')
      clock.tick(500)
      stopAction('checkout')

      expect(rawRumEvents).toHaveSize(1)
      const actionEvent = rawRumEvents[0].rawRumEvent as RawRumActionEvent
      expect(actionEvent.action.loading_time).toBe((500 * 1e6) as ServerDuration)
    })
  })

  describe('action types', () => {
    ;[ActionType.SWIPE, ActionType.TAP, ActionType.SCROLL].forEach((actionType) => {
      it(`should support ${actionType} action type`, () => {
        startAction('test_action', { type: actionType })
        stopAction('test_action')

        expect(rawRumEvents).toHaveSize(1)
        expect(rawRumEvents[0].rawRumEvent).toEqual(
          jasmine.objectContaining({
            type: RumEventType.ACTION,
            action: jasmine.objectContaining({
              type: actionType,
            }),
          })
        )
      })
    })

    it('should handle type precedence (stop overrides start)', () => {
      startAction('action1', { type: ActionType.TAP })
      stopAction('action1', { type: ActionType.SCROLL })

      startAction('action2', { type: ActionType.SWIPE })
      stopAction('action2')

      startAction('action3')
      stopAction('action3')

      expect(rawRumEvents).toHaveSize(3)
      expect(rawRumEvents[0].rawRumEvent).toEqual(
        jasmine.objectContaining({
          action: jasmine.objectContaining({ type: ActionType.SCROLL }),
        })
      )
      expect(rawRumEvents[1].rawRumEvent).toEqual(
        jasmine.objectContaining({
          action: jasmine.objectContaining({ type: ActionType.SWIPE }),
        })
      )
      expect(rawRumEvents[2].rawRumEvent).toEqual(
        jasmine.objectContaining({
          action: jasmine.objectContaining({ type: ActionType.CUSTOM }),
        })
      )
    })
  })

  describe('actionKey', () => {
    it('should support actionKey for tracking same name multiple times', () => {
      startAction('click', { actionKey: 'button1' })
      startAction('click', { actionKey: 'button2' })

      clock.tick(100)
      stopAction('click', { actionKey: 'button2' })

      clock.tick(100)
      stopAction('click', { actionKey: 'button1' })

      expect(rawRumEvents).toHaveSize(2)
      expect(rawRumEvents[0].duration).toBe(100 as Duration)
      expect(rawRumEvents[1].duration).toBe(200 as Duration)
    })

    it('getActionLookupKey should not collide', () => {
      startAction('foo bar')
      startAction('foo', { actionKey: 'bar' })

      const actionIds = actionContexts.findActionId()
      expect(Array.isArray(actionIds)).toBeTrue()
      expect((actionIds as string[]).length).toBe(2)

      stopAction('foo bar')
      stopAction('foo', { actionKey: 'bar' })

      expect(rawRumEvents).toHaveSize(2)
      expect(rawRumEvents[0].rawRumEvent).toEqual(
        jasmine.objectContaining({
          action: jasmine.objectContaining({ target: { name: 'foo bar' } }),
        })
      )
      expect(rawRumEvents[1].rawRumEvent).toEqual(
        jasmine.objectContaining({
          action: jasmine.objectContaining({ target: { name: 'foo' } }),
        })
      )
    })
  })

  describe('event counting', () => {
    it('should include counts in the action event', () => {
      startAction('complex-action')

      const actionId = actionContexts.findActionId()

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ERROR,
        action: { id: actionId },
      } as any)
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ERROR,
        action: { id: actionId },
      } as any)
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.RESOURCE,
        action: { id: actionId },
      } as any)
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.LONG_TASK,
        action: { id: actionId },
      } as any)

      stopAction('complex-action')

      expect(rawRumEvents).toHaveSize(1)
      const actionEvent = rawRumEvents[0].rawRumEvent as RawRumActionEvent
      expect(actionEvent.action.error?.count).toBe(2)
      expect(actionEvent.action.resource?.count).toBe(1)
      expect(actionEvent.action.long_task?.count).toBe(1)
    })
  })

  describe('frustration detection', () => {
    it('should include ERROR_CLICK frustration when action has errors', () => {
      startAction('error-action')

      const actionId = actionContexts.findActionId()

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ERROR,
        action: { id: actionId },
      } as any)

      stopAction('error-action')

      expect(rawRumEvents).toHaveSize(1)
      const actionEvent = rawRumEvents[0].rawRumEvent as RawRumActionEvent
      expect(actionEvent.action.frustration?.type).toEqual([FrustrationType.ERROR_CLICK])
    })

    it('should have empty frustration array when action has no errors', () => {
      startAction('success-action')
      stopAction('success-action')

      expect(rawRumEvents).toHaveSize(1)
      const actionEvent = rawRumEvents[0].rawRumEvent as RawRumActionEvent
      expect(actionEvent.action.frustration?.type).toEqual([])
    })

    it('should include ERROR_CLICK frustration when action has multiple errors', () => {
      startAction('multi-error-action')

      const actionId = actionContexts.findActionId()

      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ERROR,
        action: { id: actionId },
      } as any)
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ERROR,
        action: { id: actionId },
      } as any)

      stopAction('multi-error-action')

      expect(rawRumEvents).toHaveSize(1)
      const actionEvent = rawRumEvents[0].rawRumEvent as RawRumActionEvent
      expect(actionEvent.action.frustration?.type).toEqual([FrustrationType.ERROR_CLICK])
      expect(actionEvent.action.error?.count).toBe(2)
    })
  })
})
