import { Duration, RelativeTime, relativeToClocks } from '@datadog/browser-core'
import { setup, TestSetupBuilder } from '../../test/specHelper'
import { LifeCycleEventType } from './lifeCycle'
import {
  ACTION_CONTEXT_TIME_OUT_DELAY,
  CLEAR_OLD_CONTEXTS_INTERVAL,
  ParentContexts,
  startParentContexts,
  VIEW_CONTEXT_TIME_OUT_DELAY,
} from './parentContexts'
import { AutoAction } from './rumEventsCollection/action/trackActions'
import { ViewCreatedEvent } from './rumEventsCollection/view/trackViews'

function stubActionWithDuration(duration: number): AutoAction {
  const action: Partial<AutoAction> = { duration: duration as Duration }
  return action as AutoAction
}

describe('parentContexts', () => {
  const FAKE_ID = 'fake'
  const startClocks = relativeToClocks(10 as RelativeTime)

  function buildViewCreatedEvent(partialViewCreatedEvent: Partial<ViewCreatedEvent> = {}): ViewCreatedEvent {
    return {
      location,
      startClocks,
      id: FAKE_ID,
      referrer: 'http://foo.com',
      ...partialViewCreatedEvent,
    }
  }

  let sessionId: string
  let setupBuilder: TestSetupBuilder
  let parentContexts: ParentContexts

  beforeEach(() => {
    sessionId = 'fake-session'
    setupBuilder = setup()
      .withFakeLocation('http://fake-url.com')
      .withSession({
        getId: () => sessionId,
        isTracked: () => true,
        isTrackedWithResource: () => true,
      })
      .beforeBuild(({ lifeCycle, session }) => {
        parentContexts = startParentContexts(lifeCycle, session)
        return parentContexts
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('findView', () => {
    it('should return undefined when there is no current view and no startTime', () => {
      setupBuilder.build()

      expect(parentContexts.findView()).toBeUndefined()
    })

    it('should return the current view context when there is no start time', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, buildViewCreatedEvent())

      expect(parentContexts.findView()).toBeDefined()
      expect(parentContexts.findView()!.view.id).toEqual(FAKE_ID)
    })

    it('should return the view context corresponding to startTime', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(
        LifeCycleEventType.VIEW_CREATED,
        buildViewCreatedEvent({ startClocks: relativeToClocks(10 as RelativeTime), id: 'view 1' })
      )
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, { endClocks: relativeToClocks(20 as RelativeTime) })

      lifeCycle.notify(
        LifeCycleEventType.VIEW_CREATED,
        buildViewCreatedEvent({ startClocks: relativeToClocks(20 as RelativeTime), id: 'view 2' })
      )
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, { endClocks: relativeToClocks(30 as RelativeTime) })

      lifeCycle.notify(
        LifeCycleEventType.VIEW_CREATED,
        buildViewCreatedEvent({ startClocks: relativeToClocks(30 as RelativeTime), id: 'view 3' })
      )

      expect(parentContexts.findView(15 as RelativeTime)!.view.id).toEqual('view 1')
      expect(parentContexts.findView(20 as RelativeTime)!.view.id).toEqual('view 2')
      expect(parentContexts.findView(40 as RelativeTime)!.view.id).toEqual('view 3')
    })

    it('should return undefined when no view context corresponding to startTime', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(
        LifeCycleEventType.VIEW_CREATED,
        buildViewCreatedEvent({ startClocks: relativeToClocks(10 as RelativeTime), id: 'view 1' })
      )
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, { endClocks: relativeToClocks(20 as RelativeTime) })
      lifeCycle.notify(
        LifeCycleEventType.VIEW_CREATED,
        buildViewCreatedEvent({ startClocks: relativeToClocks(20 as RelativeTime), id: 'view 2' })
      )
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, { endClocks: relativeToClocks(20 as RelativeTime) })

      expect(parentContexts.findView(5 as RelativeTime)).not.toBeDefined()
    })

    it('should set the current view context on VIEW_CREATED', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, buildViewCreatedEvent())
      const newViewId = 'fake 2'
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, buildViewCreatedEvent({ id: newViewId }))

      expect(parentContexts.findView()!.view.id).toEqual(newViewId)
    })

    it('should return the current url with the current view', () => {
      const { lifeCycle, fakeLocation } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, buildViewCreatedEvent({ location: fakeLocation as Location }))
      expect(parentContexts.findView()!.view.url).toBe('http://fake-url.com/')

      history.pushState({}, '', '/foo')

      expect(parentContexts.findView()!.view.url).toBe('http://fake-url.com/foo')
    })

    it('should return the view name with the view', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, buildViewCreatedEvent({ name: 'Fake name' }))
      expect(parentContexts.findView()!.view.name).toBe('Fake name')
    })

    it('should update session id only on VIEW_CREATED', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, buildViewCreatedEvent())
      expect(parentContexts.findView()!.session.id).toBe('fake-session')

      sessionId = 'other-session'
      expect(parentContexts.findView()!.session.id).toBe('fake-session')

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, buildViewCreatedEvent({ id: 'fake 2' }))
      expect(parentContexts.findView()!.session.id).toBe('other-session')
    })
  })

  describe('findAction', () => {
    it('should return undefined when there is no current action and no startTime', () => {
      setupBuilder.build()

      expect(parentContexts.findAction()).toBeUndefined()
    })

    it('should return the current action context when no startTime', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startClocks, id: FAKE_ID })

      expect(parentContexts.findAction()).toBeDefined()
      expect(parentContexts.findAction()!.action.id).toBe(FAKE_ID)
    })

    it('should return the action context corresponding to startTime', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, {
        startClocks: relativeToClocks(10 as RelativeTime),
        id: 'action 1',
      })
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, stubActionWithDuration(10))

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, {
        startClocks: relativeToClocks(30 as RelativeTime),
        id: 'action 2',
      })
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, stubActionWithDuration(10))

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, {
        startClocks: relativeToClocks(50 as RelativeTime),
        id: 'action 3',
      })

      expect(parentContexts.findAction(15 as RelativeTime)!.action.id).toBe('action 1')
      expect(parentContexts.findAction(20 as RelativeTime)!.action.id).toBe('action 1')
      expect(parentContexts.findAction(30 as RelativeTime)!.action.id).toBe('action 2')
      expect(parentContexts.findAction(55 as RelativeTime)!.action.id).toBe('action 3')
    })

    it('should return undefined if no action context corresponding to startTime', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, {
        startClocks: relativeToClocks(10 as RelativeTime),
        id: 'action 1',
      })
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_DISCARDED)

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, {
        startClocks: relativeToClocks(20 as RelativeTime),
        id: 'action 2',
      })

      expect(parentContexts.findAction(10 as RelativeTime)).toBeUndefined()
    })

    it('should clear the current action on ACTION_DISCARDED', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startClocks, id: FAKE_ID })
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_DISCARDED)

      expect(parentContexts.findAction()).toBeUndefined()
    })

    it('should clear the current action on ACTION_COMPLETED', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startClocks, id: FAKE_ID })
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, stubActionWithDuration(10))

      expect(parentContexts.findAction()).toBeUndefined()
    })
  })

  describe('history contexts', () => {
    it('should be cleared on SESSION_RENEWED', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(
        LifeCycleEventType.VIEW_CREATED,
        buildViewCreatedEvent({
          id: 'view 1',
          startClocks: relativeToClocks(10 as RelativeTime),
        })
      )
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, { endClocks: relativeToClocks(20 as RelativeTime) })
      lifeCycle.notify(
        LifeCycleEventType.VIEW_CREATED,
        buildViewCreatedEvent({
          id: 'view 2',
          startClocks: relativeToClocks(20 as RelativeTime),
        })
      )
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, {
        startClocks: relativeToClocks(10 as RelativeTime),
        id: 'action 1',
      })
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, stubActionWithDuration(10))
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, {
        startClocks: relativeToClocks(20 as RelativeTime),
        id: 'action 2',
      })

      expect(parentContexts.findView(15 as RelativeTime)).toBeDefined()
      expect(parentContexts.findAction(15 as RelativeTime)).toBeDefined()
      expect(parentContexts.findView(25 as RelativeTime)).toBeDefined()
      expect(parentContexts.findAction(25 as RelativeTime)).toBeDefined()

      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      expect(parentContexts.findView(15 as RelativeTime)).toBeUndefined()
      expect(parentContexts.findAction(15 as RelativeTime)).toBeUndefined()
      expect(parentContexts.findView(25 as RelativeTime)).toBeUndefined()
      expect(parentContexts.findAction(25 as RelativeTime)).toBeUndefined()
    })

    it('should be cleared when too old', () => {
      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()

      const originalTime = performance.now()
      const originalClocks = relativeToClocks(originalTime as RelativeTime)
      const targetTime = (originalTime + 5) as RelativeTime

      lifeCycle.notify(
        LifeCycleEventType.VIEW_CREATED,
        buildViewCreatedEvent({
          id: 'view 1',
          startClocks: originalClocks,
        })
      )
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {
        endClocks: relativeToClocks((originalTime + 10) as RelativeTime),
      })
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, {
        startClocks: originalClocks,
        id: 'action 1',
      })
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, stubActionWithDuration(10))
      lifeCycle.notify(
        LifeCycleEventType.VIEW_CREATED,
        buildViewCreatedEvent({ startClocks: relativeToClocks((originalTime + 10) as RelativeTime), id: 'view 2' })
      )

      clock.tick(10)
      expect(parentContexts.findView(targetTime)).toBeDefined()
      expect(parentContexts.findAction(targetTime)).toBeDefined()

      clock.tick(ACTION_CONTEXT_TIME_OUT_DELAY + CLEAR_OLD_CONTEXTS_INTERVAL)
      expect(parentContexts.findView(targetTime)).toBeDefined()
      expect(parentContexts.findAction(targetTime)).toBeUndefined()

      clock.tick(VIEW_CONTEXT_TIME_OUT_DELAY + CLEAR_OLD_CONTEXTS_INTERVAL)
      expect(parentContexts.findView(targetTime)).toBeUndefined()
      expect(parentContexts.findAction(targetTime)).toBeUndefined()
    })
  })
})
