import { LifeCycleEventType } from '../src/lifeCycle'
import {
  ACTION_CONTEXT_TIME_OUT_DELAY,
  CLEAR_OLD_CONTEXTS_INTERVAL,
  VIEW_CONTEXT_TIME_OUT_DELAY,
} from '../src/parentContexts'
import { AutoUserAction } from '../src/userActionCollection'
import { View } from '../src/viewCollection'
import { setup, TestSetupBuilder } from './specHelper'

function stubActionWithDuration(duration: number): AutoUserAction {
  const action: Partial<AutoUserAction> = { duration }
  return action as AutoUserAction
}

describe('parentContexts', () => {
  const FAKE_ID = 'fake'
  const startTime = 10

  let sessionId: string
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    sessionId = 'fake-session'
    setupBuilder = setup()
      .withFakeLocation('http://fake-url.com')
      .withSession({
        getId: () => sessionId,
        isTracked: () => true,
        isTrackedWithResource: () => true,
      })
      .withParentContexts()
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  describe('findView', () => {
    it('should return undefined when there is no current view and no startTime', () => {
      const { parentContexts } = setupBuilder.build()

      expect(parentContexts.findView()).toBeUndefined()
    })

    it('should return the current view context when there is no start time', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { location, startTime, id: FAKE_ID })

      expect(parentContexts.findView()).toBeDefined()
      expect(parentContexts.findView()!.view.id).toEqual(FAKE_ID)
    })

    it('should return the view context corresponding to startTime', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { location, startTime: 10, id: 'view 1' })
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { location, startTime: 20, id: 'view 2' })
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { location, startTime: 30, id: 'view 3' })

      expect(parentContexts.findView(15)!.view.id).toEqual('view 1')
      expect(parentContexts.findView(20)!.view.id).toEqual('view 2')
      expect(parentContexts.findView(40)!.view.id).toEqual('view 3')
    })

    it('should return undefined when no view context corresponding to startTime', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { location, startTime: 10, id: 'view 1' })
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { location, startTime: 20, id: 'view 2' })

      expect(parentContexts.findView(5)).not.toBeDefined()
    })

    it('should replace the current view context on VIEW_CREATED', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { location, startTime, id: FAKE_ID })
      const newViewId = 'fake 2'
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { location, startTime, id: newViewId })

      expect(parentContexts.findView()!.view.id).toEqual(newViewId)
    })

    it('should return the current url with the current view', () => {
      const { lifeCycle, parentContexts, fakeLocation } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime, id: FAKE_ID, location: fakeLocation as Location })
      expect(parentContexts.findView()!.view.url).toBe('http://fake-url.com/')

      history.pushState({}, '', '/foo')

      expect(parentContexts.findView()!.view.url).toBe('http://fake-url.com/foo')
    })

    it('should update session id only on VIEW_CREATED', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { location, startTime, id: FAKE_ID })
      expect(parentContexts.findView()!.sessionId).toBe('fake-session')

      sessionId = 'other-session'
      expect(parentContexts.findView()!.sessionId).toBe('fake-session')

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { location, startTime, id: 'fake 2' })
      expect(parentContexts.findView()!.sessionId).toBe('other-session')
    })
  })

  describe('findAction', () => {
    it('should return undefined when there is no current action and no startTime', () => {
      const { parentContexts } = setupBuilder.build()

      expect(parentContexts.findAction()).toBeUndefined()
    })

    it('should return the current action context when no startTime', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime, id: FAKE_ID })

      expect(parentContexts.findAction()).toBeDefined()
      expect(parentContexts.findAction()!.userAction.id).toBe(FAKE_ID)
    })

    it('should return the action context corresponding to startTime', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime: 10, id: 'action 1' })
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, stubActionWithDuration(10))

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime: 30, id: 'action 2' })
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, stubActionWithDuration(10))

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime: 50, id: 'action 3' })

      expect(parentContexts.findAction(15)!.userAction.id).toBe('action 1')
      expect(parentContexts.findAction(20)!.userAction.id).toBe('action 1')
      expect(parentContexts.findAction(30)!.userAction.id).toBe('action 2')
      expect(parentContexts.findAction(55)!.userAction.id).toBe('action 3')
    })

    it('should return undefined if no action context corresponding to startTime', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime: 10, id: 'action 1' })
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_DISCARDED)

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime: 20, id: 'action 2' })

      expect(parentContexts.findAction(10)).toBeUndefined()
    })

    it('should clear the current action on ACTION_DISCARDED', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime, id: FAKE_ID })
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_DISCARDED)

      expect(parentContexts.findAction()).toBeUndefined()
    })

    it('should clear the current action on ACTION_COMPLETED', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime, id: FAKE_ID })
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, stubActionWithDuration(10))

      expect(parentContexts.findAction()).toBeUndefined()
    })
  })

  describe('history contexts', () => {
    it('should be cleared on SESSION_RENEWED', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { location, startTime: 10, id: 'view 1' })
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { location, startTime: 20, id: 'view 2' })
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime: 10, id: 'action 1' })
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, stubActionWithDuration(10))
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime: 20, id: 'action 2' })

      expect(parentContexts.findView(15)).toBeDefined()
      expect(parentContexts.findAction(15)).toBeDefined()
      expect(parentContexts.findView(25)).toBeDefined()
      expect(parentContexts.findAction(25)).toBeDefined()

      lifeCycle.notify(LifeCycleEventType.SESSION_RENEWED)

      expect(parentContexts.findView(15)).toBeUndefined()
      expect(parentContexts.findAction(15)).toBeUndefined()
      expect(parentContexts.findView(25)).toBeUndefined()
      expect(parentContexts.findAction(25)).toBeUndefined()
    })

    it('should be cleared when too old', () => {
      const { lifeCycle, parentContexts, clock } = setupBuilder.withFakeClock().build()

      const originalTime = performance.now()
      const targetTime = originalTime + 5

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { location, startTime: originalTime, id: 'view 1' })
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime: originalTime, id: 'action 1' })
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, stubActionWithDuration(10))
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { location, startTime: originalTime + 10, id: 'view 2' })

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
