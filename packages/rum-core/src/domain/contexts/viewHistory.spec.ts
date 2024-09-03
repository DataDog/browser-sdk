import type { Context, RelativeTime } from '@datadog/browser-core'
import { relativeToClocks, CLEAR_OLD_VALUES_INTERVAL } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import type { ViewCreatedEvent, ViewEvent } from '../view/trackViews'
import type { ViewHistory } from './viewHistory'
import { startViewHistory, VIEW_CONTEXT_TIME_OUT_DELAY } from './viewHistory'

describe('ViewHistory', () => {
  const FAKE_ID = 'fake'
  const startClocks = relativeToClocks(10 as RelativeTime)
  const lifeCycle = new LifeCycle()

  function buildViewCreatedEvent(partialViewCreatedEvent: Partial<ViewCreatedEvent> = {}): ViewCreatedEvent {
    return {
      startClocks,
      id: FAKE_ID,
      ...partialViewCreatedEvent,
    }
  }

  let clock: Clock
  let viewHistory: ViewHistory

  beforeEach(() => {
    clock = mockClock()
    viewHistory = startViewHistory(lifeCycle)

    registerCleanupTask(() => {
      viewHistory.stop()
      clock.cleanup()
    })
  })

  describe('findView', () => {
    it('should return undefined when there is no current view and no startTime', () => {
      expect(viewHistory.findView()).toBeUndefined()
    })

    it('should return the current view context when there is no start time', () => {
      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, buildViewCreatedEvent())

      expect(viewHistory.findView()).toBeDefined()
      expect(viewHistory.findView()!.id).toEqual(FAKE_ID)
    })

    it('should return the view context corresponding to startTime', () => {
      lifeCycle.notify(
        LifeCycleEventType.BEFORE_VIEW_CREATED,
        buildViewCreatedEvent({ startClocks: relativeToClocks(10 as RelativeTime), id: 'view 1' })
      )
      lifeCycle.notify(LifeCycleEventType.AFTER_VIEW_ENDED, { endClocks: relativeToClocks(20 as RelativeTime) })

      lifeCycle.notify(
        LifeCycleEventType.BEFORE_VIEW_CREATED,
        buildViewCreatedEvent({ startClocks: relativeToClocks(20 as RelativeTime), id: 'view 2' })
      )
      lifeCycle.notify(LifeCycleEventType.AFTER_VIEW_ENDED, { endClocks: relativeToClocks(30 as RelativeTime) })

      lifeCycle.notify(
        LifeCycleEventType.BEFORE_VIEW_CREATED,
        buildViewCreatedEvent({ startClocks: relativeToClocks(30 as RelativeTime), id: 'view 3' })
      )

      expect(viewHistory.findView(15 as RelativeTime)!.id).toEqual('view 1')
      expect(viewHistory.findView(20 as RelativeTime)!.id).toEqual('view 2')
      expect(viewHistory.findView(40 as RelativeTime)!.id).toEqual('view 3')
    })

    it('should return undefined when no view context corresponding to startTime', () => {
      lifeCycle.notify(
        LifeCycleEventType.BEFORE_VIEW_CREATED,
        buildViewCreatedEvent({ startClocks: relativeToClocks(10 as RelativeTime), id: 'view 1' })
      )
      lifeCycle.notify(LifeCycleEventType.AFTER_VIEW_ENDED, { endClocks: relativeToClocks(20 as RelativeTime) })
      lifeCycle.notify(
        LifeCycleEventType.BEFORE_VIEW_CREATED,
        buildViewCreatedEvent({ startClocks: relativeToClocks(20 as RelativeTime), id: 'view 2' })
      )
      lifeCycle.notify(LifeCycleEventType.AFTER_VIEW_ENDED, { endClocks: relativeToClocks(20 as RelativeTime) })

      expect(viewHistory.findView(5 as RelativeTime)).not.toBeDefined()
    })

    it('should set the current view context on BEFORE_VIEW_CREATED', () => {
      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, buildViewCreatedEvent())
      const newViewId = 'fake 2'
      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, buildViewCreatedEvent({ id: newViewId }))

      expect(viewHistory.findView()!.id).toEqual(newViewId)
    })

    it('should return the view name with the view', () => {
      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, buildViewCreatedEvent({ name: 'Fake name' }))
      expect(viewHistory.findView()!.name).toBe('Fake name')
    })

    it('should update the view name for the current context', () => {
      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, buildViewCreatedEvent({ name: 'foo' }))
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        startClocks,
        name: 'Fake Name',
      } as ViewEvent)
      expect(viewHistory.findView()!.name).toBe('Fake Name')
    })

    it('should update the view context for the current context', () => {
      lifeCycle.notify(LifeCycleEventType.BEFORE_VIEW_CREATED, buildViewCreatedEvent({ context: { foo: 'bar' } }))
      lifeCycle.notify(LifeCycleEventType.VIEW_UPDATED, {
        startClocks,
        context: { bar: 'foo' } as Context,
      } as ViewEvent)
      expect(viewHistory.findView()!.context).toEqual({ bar: 'foo' })
    })
  })

  describe('history contexts', () => {
    it('should be cleared on SESSION_RENEWED', () => {
      lifeCycle.notify(
        LifeCycleEventType.BEFORE_VIEW_CREATED,
        buildViewCreatedEvent({
          id: 'view 1',
          startClocks: relativeToClocks(10 as RelativeTime),
        })
      )
      lifeCycle.notify(LifeCycleEventType.AFTER_VIEW_ENDED, { endClocks: relativeToClocks(20 as RelativeTime) })
      lifeCycle.notify(
        LifeCycleEventType.BEFORE_VIEW_CREATED,
        buildViewCreatedEvent({
          id: 'view 2',
          startClocks: relativeToClocks(20 as RelativeTime),
        })
      )

      expect(viewHistory.findView(15 as RelativeTime)).toBeDefined()
      expect(viewHistory.findView(25 as RelativeTime)).toBeDefined()

      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      expect(viewHistory.findView(15 as RelativeTime)).toBeUndefined()
      expect(viewHistory.findView(25 as RelativeTime)).toBeUndefined()
    })

    it('should be cleared when too old', () => {
      const originalTime = performance.now()
      const originalClocks = relativeToClocks(originalTime as RelativeTime)
      const targetTime = (originalTime + 5) as RelativeTime

      lifeCycle.notify(
        LifeCycleEventType.BEFORE_VIEW_CREATED,
        buildViewCreatedEvent({
          id: 'view 1',
          startClocks: originalClocks,
        })
      )
      lifeCycle.notify(LifeCycleEventType.AFTER_VIEW_ENDED, {
        endClocks: relativeToClocks((originalTime + 10) as RelativeTime),
      })
      lifeCycle.notify(
        LifeCycleEventType.BEFORE_VIEW_CREATED,
        buildViewCreatedEvent({ startClocks: relativeToClocks((originalTime + 10) as RelativeTime), id: 'view 2' })
      )

      clock.tick(10)
      expect(viewHistory.findView(targetTime)).toBeDefined()

      clock.tick(VIEW_CONTEXT_TIME_OUT_DELAY + CLEAR_OLD_VALUES_INTERVAL)
      expect(viewHistory.findView(targetTime)).toBeUndefined()
    })
  })

  describe('custom context', () => {
    it('should be set on view creation', () => {
      lifeCycle.notify(
        LifeCycleEventType.BEFORE_VIEW_CREATED,
        buildViewCreatedEvent({
          id: 'view 1',
          context: {
            foo: 'bar',
          },
        })
      )
      expect(viewHistory.findView()).toBeDefined()
      expect(viewHistory.findView()!.context).toEqual({
        foo: 'bar',
      })
    })
  })

  describe('custom context', () => {
    it('should be set on view creation', () => {
      lifeCycle.notify(
        LifeCycleEventType.BEFORE_VIEW_CREATED,
        buildViewCreatedEvent({
          id: 'view 1',
          context: {
            foo: 'bar',
          },
        })
      )
      expect(viewHistory.findView()).toBeDefined()
      expect(viewHistory.findView()!.context).toEqual({
        foo: 'bar',
      })
    })
  })
})
