import { LifeCycleEventType } from '../src/lifeCycle'
import { AutoUserAction } from '../src/userActionCollection'
import { setup, TestSetupBuilder } from './specHelper'

function stubActionWithDuration(duration: number): AutoUserAction {
  const action: Partial<AutoUserAction> = { duration }
  return action as AutoUserAction
}

describe('parentContexts (only current)', () => {
  const FAKE_ID = 'fake'
  const startTime = 10

  let fakeUrl: string
  let sessionId: string
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    fakeUrl = 'fake-url'
    sessionId = 'fake-session'
    const fakeLocation = {
      get href() {
        return fakeUrl
      },
    }
    setupBuilder = setup()
      .withFakeLocation(fakeLocation)
      .withSession({
        getId: () => sessionId,
        isTracked: () => true,
        isTrackedWithResource: () => true,
      })
      .withParentContexts(false)
  })

  describe('findView', () => {
    it('should return undefined if there is no current view', () => {
      const { parentContexts } = setupBuilder.build()

      expect(parentContexts.findView()).toBeUndefined()
    })

    it('should return the current view context', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime, id: FAKE_ID })

      expect(parentContexts.findView()).toBeDefined()
      expect(parentContexts.findView()!.view.id).toEqual(FAKE_ID)
    })

    it('should replace the current view context on VIEW_CREATED', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime, id: FAKE_ID })
      const newViewId = 'fake 2'
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime, id: newViewId })

      expect(parentContexts.findView()!.view.id).toEqual(newViewId)
    })

    it('should return the current url with the current view', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime, id: FAKE_ID })
      expect(parentContexts.findView()!.view.url).toBe('fake-url')

      fakeUrl = 'other-url'

      expect(parentContexts.findView()!.view.url).toBe('other-url')
    })

    it('should update session id only on VIEW_CREATED', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime, id: FAKE_ID })
      expect(parentContexts.findView()!.sessionId).toBe('fake-session')

      sessionId = 'other-session'
      expect(parentContexts.findView()!.sessionId).toBe('fake-session')

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime, id: 'fake 2' })
      expect(parentContexts.findView()!.sessionId).toBe('other-session')
    })
  })

  describe('findAction', () => {
    it('should return undefined if there is no current action', () => {
      const { parentContexts } = setupBuilder.build()

      expect(parentContexts.findAction()).toBeUndefined()
    })

    it('should return the current action context', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime, id: FAKE_ID })

      expect(parentContexts.findAction()).toBeDefined()
      expect(parentContexts.findAction()!.userAction.id).toBe(FAKE_ID)
    })

    it('should return undefined if startTime is before the start of the current action', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime, id: FAKE_ID })

      expect(parentContexts.findAction(startTime - 1)).toBeUndefined()
    })

    it('should clear the current action on AUTO_ACTION_DISCARDED', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime, id: FAKE_ID })
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_DISCARDED)

      expect(parentContexts.findAction()).toBeUndefined()
    })

    it('should clear the current action on AUTO_ACTION_COMPLETED', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { startTime, id: FAKE_ID })
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, undefined as any)

      expect(parentContexts.findAction()).toBeUndefined()
    })
  })
})

describe('parentContexts (with context history)', () => {
  const FAKE_ID = 'fake'
  const startTime = 10

  let fakeUrl: string
  let sessionId: string
  let setupBuilder: TestSetupBuilder

  beforeEach(() => {
    fakeUrl = 'fake-url'
    sessionId = 'fake-session'
    const fakeLocation = {
      get href() {
        return fakeUrl
      },
    }
    setupBuilder = setup()
      .withFakeLocation(fakeLocation)
      .withSession({
        getId: () => sessionId,
        isTracked: () => true,
        isTrackedWithResource: () => true,
      })
      .withParentContexts(true)
  })

  describe('findView', () => {
    it('should return undefined when there is no current view and no startTime', () => {
      const { parentContexts } = setupBuilder.build()

      expect(parentContexts.findView()).toBeUndefined()
    })

    it('should return the current view context when there is no start time', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime, id: FAKE_ID })

      expect(parentContexts.findView()).toBeDefined()
      expect(parentContexts.findView()!.view.id).toEqual(FAKE_ID)
    })

    it('should return the view context corresponding to startTime', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime: 10, id: 'view 1' })
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime: 20, id: 'view 2' })
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime: 30, id: 'view 3' })

      expect(parentContexts.findView(15)!.view.id).toEqual('view 1')
      expect(parentContexts.findView(20)!.view.id).toEqual('view 2')
      expect(parentContexts.findView(40)!.view.id).toEqual('view 3')
    })

    it('should return undefined when no view context corresponding to startTime', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime: 10, id: 'view 1' })
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime: 20, id: 'view 2' })

      expect(parentContexts.findView(5)).not.toBeDefined()
    })

    it('should replace the current view context on VIEW_CREATED', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime, id: FAKE_ID })
      const newViewId = 'fake 2'
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime, id: newViewId })

      expect(parentContexts.findView()!.view.id).toEqual(newViewId)
    })

    it('should return the current url with the current view', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime, id: FAKE_ID })
      expect(parentContexts.findView()!.view.url).toBe('fake-url')

      fakeUrl = 'other-url'

      expect(parentContexts.findView()!.view.url).toBe('other-url')
    })

    it('should update session id only on VIEW_CREATED', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime, id: FAKE_ID })
      expect(parentContexts.findView()!.sessionId).toBe('fake-session')

      sessionId = 'other-session'
      expect(parentContexts.findView()!.sessionId).toBe('fake-session')

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime, id: 'fake 2' })
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
})
