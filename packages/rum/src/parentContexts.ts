import { LifeCycle, LifeCycleEventType } from './lifeCycle'

export interface ViewContext {
  id: string
  sessionId: string | undefined
  location: Location
}

export interface ActionContext {
  id: string
}

interface InternalViewContext {
  viewContext: ViewContext
  startTime: number
}

interface InternalActionContext {
  actionContext: ActionContext
  startTime: number
}

export interface ParentContexts {
  findAction: (startTime?: number) => ActionContext | undefined
  findView: (startTime?: number) => ViewContext | undefined
}

export function startParentContexts(lifeCycle: LifeCycle): ParentContexts {
  let currentView: InternalViewContext
  let currentAction: InternalActionContext | undefined

  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (data) => {
    currentView = data
  })

  lifeCycle.subscribe(LifeCycleEventType.ACTION_CREATED, (data) => {
    currentAction = data
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
      return currentAction.actionContext
    },
    findView: () => currentView && currentView.viewContext,
  }
}
