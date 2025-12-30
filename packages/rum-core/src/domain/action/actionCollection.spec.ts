import type { Duration, RelativeTime, ServerDuration, TimeStamp } from '@datadog/browser-core'
import { addDuration, ExperimentalFeature, HookNames, Observable } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { createNewEvent, mockClock, mockExperimentalFeatures, registerCleanupTask } from '@datadog/browser-core/test'
import { collectAndValidateRawRumEvents, mockRumConfiguration } from '../../../test'
import type { RawRumActionEvent, RawRumEvent } from '../../rawRumEvent.types'
import { RumEventType, ActionType } from '../../rawRumEvent.types'
import type { RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { DefaultTelemetryEventAttributes, Hooks } from '../hooks'
import { createHooks } from '../hooks'
import type { RumMutationRecord } from '../../browser/domMutationObservable'
import type { ActionContexts } from './actionCollection'
import { LONG_TASK_START_TIME_CORRECTION, startActionCollection } from './actionCollection'
import { ActionNameSource } from './actionNameConstants'

describe('actionCollection', () => {
  const lifeCycle = new LifeCycle()
  let hooks: Hooks
  let addAction: ReturnType<typeof startActionCollection>['addAction']
  let rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>>
  let actionContexts: ActionContexts
  let startAction: ReturnType<typeof startActionCollection>['startAction']
  let stopAction: ReturnType<typeof startActionCollection>['stopAction']
  let clock: Clock

  beforeEach(() => {
    const domMutationObservable = new Observable<RumMutationRecord[]>()
    const windowOpenObservable = new Observable<void>()
    hooks = createHooks()

    const actionCollection = startActionCollection(
      lifeCycle,
      hooks,
      domMutationObservable,
      windowOpenObservable,
      mockRumConfiguration()
    )
    registerCleanupTask(actionCollection.stop)
    addAction = actionCollection.addAction
    startAction = actionCollection.startAction
    stopAction = actionCollection.stopAction
    actionContexts = actionCollection.actionContexts

    rawRumEvents = collectAndValidateRawRumEvents(lifeCycle)
  })

  it('should create action from auto action with name source', () => {
    const event = createNewEvent('pointerup', { target: document.createElement('button') })
    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, {
      counts: {
        errorCount: 10,
        longTaskCount: 10,
        resourceCount: 10,
      },
      frustrationTypes: [],
      duration: 100 as Duration,
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      name: 'foo',
      nameSource: ActionNameSource.TEXT_CONTENT,
      startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
      type: ActionType.CLICK,
      event,
      target: {
        selector: '#foo',
        width: 1,
        height: 2,
      },
      position: { x: 1, y: 2 },
      events: [event],
    })

    expect(rawRumEvents[0].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      action: {
        error: {
          count: 10,
        },
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        loading_time: (100 * 1e6) as ServerDuration,
        frustration: {
          type: [],
        },
        long_task: {
          count: 10,
        },
        resource: {
          count: 10,
        },
        target: {
          name: 'foo',
        },
        type: ActionType.CLICK,
      },
      date: jasmine.any(Number),
      type: RumEventType.ACTION,
      _dd: {
        action: {
          target: {
            selector: '#foo',
            width: 1,
            height: 2,
          },
          name_source: 'text_content',
          position: {
            x: 1,
            y: 2,
          },
        },
      },
    })
    expect(rawRumEvents[0].domainContext).toEqual({
      events: [event],
    })
  })

  it('should create action from custom action', () => {
    addAction({
      name: 'foo',
      startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
      type: ActionType.CUSTOM,
      duration: 0 as Duration,
      context: { foo: 'bar' },
    })

    expect(rawRumEvents[0].startTime).toBe(1234 as RelativeTime)
    expect(rawRumEvents[0].rawRumEvent).toEqual({
      action: {
        id: jasmine.any(String),
        target: {
          name: 'foo',
        },
        type: ActionType.CUSTOM,
      },
      date: jasmine.any(Number),
      type: RumEventType.ACTION,
      context: { foo: 'bar' },
    })

    expect(rawRumEvents[0].domainContext).toEqual({ handlingStack: undefined })
  })
  it('should not set the loading time field of the action', () => {
    const event = createNewEvent('pointerup', { target: document.createElement('button') })
    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, {
      counts: {
        errorCount: 0,
        longTaskCount: 0,
        resourceCount: 0,
      },
      duration: -10 as Duration,
      event,
      events: [event],
      frustrationTypes: [],
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      name: 'foo',
      nameSource: ActionNameSource.TEXT_CONTENT,
      startClocks: { relative: 0 as RelativeTime, timeStamp: 0 as TimeStamp },
      type: ActionType.CLICK,
    })
    expect((rawRumEvents[0].rawRumEvent as RawRumActionEvent).action.loading_time).toBeUndefined()
  })

  it('should create action with handling stack', () => {
    addAction({
      name: 'foo',
      startClocks: { relative: 1234 as RelativeTime, timeStamp: 123456789 as TimeStamp },
      type: ActionType.CUSTOM,
      duration: 0 as Duration,
      handlingStack: 'Error\n    at foo\n    at bar',
    })

    expect(rawRumEvents[0].domainContext).toEqual({
      handlingStack: 'Error\n    at foo\n    at bar',
    })
  })

  describe('assembly hook', () => {
    ;[RumEventType.RESOURCE, RumEventType.LONG_TASK, RumEventType.ERROR].forEach((eventType) => {
      it(`should add action properties on ${eventType} from the context`, () => {
        const actionId = '1'
        spyOn(actionContexts, 'findActionId').and.returnValue(actionId)
        const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
          eventType,
          startTime: 0 as RelativeTime,
        })

        expect(defaultRumEventAttributes).toEqual({ type: eventType, action: { id: actionId } })
      })
    })
    ;[RumEventType.VIEW, RumEventType.VITAL].forEach((eventType) => {
      it(`should not add action properties on ${eventType} from the context`, () => {
        const actionId = '1'
        spyOn(actionContexts, 'findActionId').and.returnValue(actionId)
        const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
          eventType,
          startTime: 0 as RelativeTime,
        })

        expect(defaultRumEventAttributes).toEqual(undefined)
      })
    })

    it('should add action properties on long task from the context when the start time is slightly before the action start time', () => {
      const longTaskStartTime = 100 as RelativeTime
      const findActionIdSpy = spyOn(actionContexts, 'findActionId')

      hooks.triggerHook(HookNames.Assemble, {
        eventType: RumEventType.LONG_TASK,
        startTime: longTaskStartTime,
        duration: 50 as Duration,
      })

      const [correctedStartTime] = findActionIdSpy.calls.mostRecent().args
      expect(correctedStartTime).toEqual(addDuration(longTaskStartTime, LONG_TASK_START_TIME_CORRECTION))
    })
  })

  describe('assemble telemetry hook', () => {
    it('should add action id', () => {
      const actionId = '1'
      spyOn(actionContexts, 'findActionId').and.returnValue(actionId)
      const telemetryEventAttributes = hooks.triggerHook(HookNames.AssembleTelemetry, {
        startTime: 0 as RelativeTime,
      }) as DefaultTelemetryEventAttributes

      expect(telemetryEventAttributes.action?.id).toEqual(actionId)
    })

    it('should not add action id if the action is not found', () => {
      spyOn(actionContexts, 'findActionId').and.returnValue(undefined)
      const telemetryEventAttributes = hooks.triggerHook(HookNames.AssembleTelemetry, {
        startTime: 0 as RelativeTime,
      }) as DefaultTelemetryEventAttributes

      expect(telemetryEventAttributes.action?.id).toBeUndefined()
    })
  })

  describe('startAction / stopAction', () => {
    beforeEach(() => {
      clock = mockClock()
      mockExperimentalFeatures([ExperimentalFeature.START_STOP_ACTION])
    })

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

    it('should not create action if stopped without starting', () => {
      stopAction('never_started')

      expect(rawRumEvents).toHaveSize(0)
    })

    it('should only create action once when stopped multiple times', () => {
      startAction('foo')
      stopAction('foo')
      stopAction('foo')

      expect(rawRumEvents).toHaveSize(1)
    })
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

    it('should merge contexts with stop precedence on conflicts', () => {
      startAction('action1', { context: { cart: 'abc' } })
      stopAction('action1', { context: { total: 100 } })

      startAction('action2', { context: { status: 'pending' } })
      stopAction('action2', { context: { status: 'complete' } })

      expect(rawRumEvents).toHaveSize(2)
      expect(rawRumEvents[0].rawRumEvent).toEqual(
        jasmine.objectContaining({
          context: { cart: 'abc', total: 100 },
        })
      )
      expect(rawRumEvents[1].rawRumEvent).toEqual(
        jasmine.objectContaining({
          context: { status: 'complete' },
        })
      )
    })

    it('should handle type precedence: stop > start > default(CUSTOM)', () => {
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

    it('should not create action when actionKey does not match', () => {
      startAction('click', { actionKey: 'button1' })
      stopAction('click', { actionKey: 'button2' })

      expect(rawRumEvents).toHaveSize(0)
    })

    it('should use consistent action ID from start to collected event', () => {
      startAction('checkout')
      stopAction('checkout')

      expect(rawRumEvents).toHaveSize(1)
      const actionEvent = rawRumEvents[0].rawRumEvent as RawRumActionEvent
      expect(actionEvent.action.id).toBeDefined()
      expect(typeof actionEvent.action.id).toBe('string')
      expect(actionEvent.action.id.length).toBeGreaterThan(0)
    })

    it('should return custom action ID from actionContexts.findActionId during action', () => {
      startAction('checkout')

      const actionId = actionContexts.findActionId()
      expect(actionId).toBeDefined()

      stopAction('checkout')

      expect(rawRumEvents).toHaveSize(1)
      const actionEvent = rawRumEvents[0].rawRumEvent as RawRumActionEvent
      expect(actionEvent.action.id).toBe(actionId as string)
    })

    it('should track error count during custom action', () => {
      startAction('checkout')

      const actionId = actionContexts.findActionId()
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.ERROR,
        action: { id: actionId },
        error: { message: 'test error' },
      } as any)

      stopAction('checkout')

      expect(rawRumEvents).toHaveSize(1)
      const actionEvent = rawRumEvents[0].rawRumEvent as RawRumActionEvent
      expect(actionEvent.action.error?.count).toBe(1)
    })

    it('should track resource count during custom action', () => {
      startAction('load-data')

      const actionId = actionContexts.findActionId()
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.RESOURCE,
        action: { id: actionId },
        resource: { type: 'fetch' },
      } as any)

      stopAction('load-data')

      expect(rawRumEvents).toHaveSize(1)
      const actionEvent = rawRumEvents[0].rawRumEvent as RawRumActionEvent
      expect(actionEvent.action.resource?.count).toBe(1)
    })

    it('should track long task count during custom action', () => {
      startAction('heavy-computation')

      const actionId = actionContexts.findActionId()
      lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
        type: RumEventType.LONG_TASK,
        action: { id: actionId },
        long_task: { duration: 100 },
      } as any)

      stopAction('heavy-computation')

      expect(rawRumEvents).toHaveSize(1)
      const actionEvent = rawRumEvents[0].rawRumEvent as RawRumActionEvent
      expect(actionEvent.action.long_task?.count).toBe(1)
    })

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
})
