import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { RumSession } from './rumSession'

export interface ViewContext {
  id: string
  sessionId: string | undefined
  url: string
}

export interface ActionContext {
  id: string
}

interface InternalContext {
  id: string
  startTime: number
}

export interface ParentContexts {
  findAction: (startTime?: number) => ActionContext | undefined
  findView: (startTime?: number) => ViewContext | undefined
}

export function startParentContexts(location: Location, lifeCycle: LifeCycle, session: RumSession): ParentContexts {
  let currentView: InternalContext | undefined
  let currentAction: InternalContext | undefined
  let currentSessionId: string | undefined

  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (internalContext) => {
    currentView = internalContext
    currentSessionId = session.getId()
  })

  lifeCycle.subscribe(LifeCycleEventType.ACTION_CREATED, (internalContext) => {
    currentAction = internalContext
  })

  lifeCycle.subscribe(LifeCycleEventType.ACTION_COMPLETED, () => {
    currentAction = undefined
  })

  lifeCycle.subscribe(LifeCycleEventType.ACTION_DISCARDED, () => {
    currentAction = undefined
  })

  return {
    findAction: (startTime) => {
      if (!currentAction || (startTime !== undefined && startTime < currentAction.startTime)) {
        return undefined
      }
      return { id: currentAction.id }
    },
    findView: () => currentView && { sessionId: currentSessionId, id: currentView.id, url: location.href },
  }
}
