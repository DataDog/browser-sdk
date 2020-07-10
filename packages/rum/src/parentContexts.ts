import { Context } from '@datadog/browser-core'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { RumSession } from './rumSession'
import { AutoUserAction } from './userActionCollection'

export interface ViewContext extends Context {
  sessionId: string | undefined
  view: {
    id: string
    url: string
  }
}

export interface ActionContext extends Context {
  userAction: {
    id: string
  }
}

export interface ParentContexts {
  findAction: (startTime?: number) => ActionContext | undefined
  findView: (startTime?: number) => ViewContext | undefined
}

interface CurrentContext {
  id: string
  startTime: number
}

interface PreviousContext<T> {
  startTime: number
  endTime: number
  context: T
}

export function startParentContexts(
  location: Location,
  lifeCycle: LifeCycle,
  session: RumSession,
  withContextHistory: boolean
): ParentContexts {
  let currentView: CurrentContext | undefined
  let currentAction: CurrentContext | undefined
  let currentSessionId: string | undefined

  const previousViews: Array<PreviousContext<ViewContext>> = []
  const previousActions: Array<PreviousContext<ActionContext>> = []

  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (currentContext) => {
    if (currentView && withContextHistory) {
      previousViews.unshift({
        context: buildCurrentViewContext(),
        endTime: currentContext.startTime,
        startTime: currentView.startTime,
      })
    }
    currentView = currentContext
    currentSessionId = session.getId()
  })

  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_CREATED, (currentContext) => {
    currentAction = currentContext
  })

  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, (userAction: AutoUserAction) => {
    if (currentAction && withContextHistory) {
      previousActions.unshift({
        context: buildCurrentActionContext(),
        endTime: currentAction.startTime + userAction.duration,
        startTime: currentAction.startTime,
      })
    }
    currentAction = undefined
  })

  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_DISCARDED, () => {
    currentAction = undefined
  })

  function buildCurrentViewContext() {
    return { sessionId: currentSessionId, view: { id: currentView!.id, url: location.href } }
  }

  function buildCurrentActionContext() {
    return { userAction: { id: currentAction!.id } }
  }

  function findContext<T>(
    buildContext: () => T,
    previousContexts: Array<PreviousContext<T>>,
    currentContext?: CurrentContext,
    startTime?: number
  ) {
    if (!startTime) {
      return currentContext ? buildContext() : undefined
    }
    if (currentContext && startTime >= currentContext.startTime) {
      return buildContext()
    }
    if (!withContextHistory) {
      return undefined
    }
    for (const previousContext of previousContexts) {
      if (startTime > previousContext.endTime) {
        break
      }
      if (startTime >= previousContext.startTime) {
        return previousContext.context
      }
    }
    return undefined
  }

  return {
    findAction: (startTime) => {
      return findContext(buildCurrentActionContext, previousActions, currentAction, startTime)
    },
    findView: (startTime) => {
      return findContext(buildCurrentViewContext, previousViews, currentView, startTime)
    },
  }
}
