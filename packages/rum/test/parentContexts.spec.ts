import { LifeCycleEventType } from '../src/lifeCycle'
import { setup, TestSetupBuilder } from './specHelper'

describe('parentContexts', () => {
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
      .withParentContexts()
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
      expect(parentContexts.findView()!.id).toEqual(FAKE_ID)
    })

    it('should replace the current view context on VIEW_CREATED', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime, id: FAKE_ID })
      const newViewId = 'fake 2'
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime, id: newViewId })

      expect(parentContexts.findView()!.id).toEqual(newViewId)
    })

    it('should return the current url with the current view', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { startTime, id: FAKE_ID })
      expect(parentContexts.findView()!.url).toBe('fake-url')

      fakeUrl = 'other-url'

      expect(parentContexts.findView()!.url).toBe('other-url')
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

      lifeCycle.notify(LifeCycleEventType.ACTION_CREATED, { startTime, id: FAKE_ID })

      expect(parentContexts.findAction()).toBeDefined()
      expect(parentContexts.findAction()!.id).toBe(FAKE_ID)
    })

    it('should return undefined if startTime is before the start of the current action', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.ACTION_CREATED, { startTime, id: FAKE_ID })

      expect(parentContexts.findAction(startTime - 1)).toBeUndefined()
    })

    it('should clear the current action on ACTION_DISCARDED', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.ACTION_CREATED, { startTime, id: FAKE_ID })
      lifeCycle.notify(LifeCycleEventType.ACTION_DISCARDED)

      expect(parentContexts.findAction()).toBeUndefined()
    })

    it('should clear the current action on ACTION_COMPLETED', () => {
      const { lifeCycle, parentContexts } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.ACTION_CREATED, { startTime, id: FAKE_ID })
      lifeCycle.notify(LifeCycleEventType.ACTION_COMPLETED, undefined as any)

      expect(parentContexts.findAction()).toBeUndefined()
    })
  })
})
