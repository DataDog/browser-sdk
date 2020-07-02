import { LifeCycle, LifeCycleEventType } from '../src/lifeCycle'
import { ParentContexts, startParentContexts } from '../src/parentContexts'

describe('parentContexts', () => {
  const actionContext = { id: 'fake' }
  const viewContext = { location, id: 'fake', sessionId: 'fake' }
  const startTime = 10

  let parentContexts: ParentContexts
  let lifeCycle: LifeCycle

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    parentContexts = startParentContexts(lifeCycle)
  })

  describe('findView', () => {
    it('should return undefined if there is no current view', () => {
      expect(parentContexts.findView()).toBeUndefined()
    })

    it('should return the current view context', () => {
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { viewContext, startTime })

      expect(parentContexts.findView()).toBe(viewContext)
    })

    it('should replace the current view context on VIEW_CREATED', () => {
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { viewContext, startTime })
      const newViewContext = { ...viewContext, id: 'fake2' }
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, { viewContext: newViewContext, startTime })

      expect(parentContexts.findView()).toBe(newViewContext)
    })
  })

  describe('findAction', () => {
    it('should return undefined if there is no current action', () => {
      expect(parentContexts.findAction()).toBeUndefined()
    })

    it('should return the current action context', () => {
      lifeCycle.notify(LifeCycleEventType.ACTION_CREATED, { actionContext, startTime })

      expect(parentContexts.findAction()).toBe(actionContext)
    })

    it('should return undefined if startTime is before the start of the current action', () => {
      lifeCycle.notify(LifeCycleEventType.ACTION_CREATED, { actionContext, startTime })

      expect(parentContexts.findAction(startTime - 1)).toBeUndefined()
    })

    it('should clear the current action on ACTION_DISCARDED', () => {
      lifeCycle.notify(LifeCycleEventType.ACTION_CREATED, { actionContext, startTime })
      lifeCycle.notify(LifeCycleEventType.ACTION_DISCARDED)

      expect(parentContexts.findAction()).toBeUndefined()
    })

    it('should clear the current action on ACTION_COMPLETED', () => {
      lifeCycle.notify(LifeCycleEventType.ACTION_CREATED, { actionContext, startTime })
      lifeCycle.notify(LifeCycleEventType.ACTION_COMPLETED, undefined as any)

      expect(parentContexts.findAction()).toBeUndefined()
    })
  })
})
