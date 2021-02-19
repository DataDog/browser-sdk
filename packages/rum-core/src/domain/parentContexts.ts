import { monitor, ONE_MINUTE, SESSION_TIME_OUT_DELAY } from '@datadog/browser-core'
import { ActionContext, ViewContext } from '../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { AutoAction, AutoActionCreatedEvent } from './rumEventsCollection/action/trackActions'
import { ViewCreatedEvent } from './rumEventsCollection/view/trackViews'
import { RumSession } from './rumSession'

export const VIEW_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY
export const ACTION_CONTEXT_TIME_OUT_DELAY = 5 * ONE_MINUTE // arbitrary
export const CLEAR_OLD_CONTEXTS_INTERVAL = ONE_MINUTE

interface PreviousContext<T> {
  startTime: number
  endTime: number
  context: T
}

export interface ParentContexts {
  findAction: (startTime?: number) => ActionContext | undefined
  findView: (startTime?: number) => ViewContext | undefined
  stop: () => void
}

export function startParentContexts(lifeCycle: LifeCycle, session: RumSession): ParentContexts {
  let currentView: ViewCreatedEvent | undefined
  let currentAction: AutoActionCreatedEvent | undefined
  let currentSessionId: string | undefined

  let previousViews: Array<PreviousContext<ViewContext>> = []
  let previousActions: Array<PreviousContext<ActionContext>> = []

  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (currentContext) => {
    if (currentView) {
      previousViews.unshift({
        context: buildCurrentViewContext(),
        endTime: currentContext.startTime,
        startTime: currentView.startTime,
      })
    }
    currentView = currentContext
    currentSessionId = session.getId()
  })

  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (currentContext) => {
    // A view can be updated after its end.  We have to ensure that the view being updated is the
    // most recently created.
    if (currentView!.id === currentContext.id) {
      currentView = currentContext
    }
  })

  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_CREATED, (currentContext) => {
    currentAction = currentContext
  })

  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, (action: AutoAction) => {
    if (currentAction) {
      previousActions.unshift({
        context: buildCurrentActionContext(),
        endTime: currentAction.startTime + action.duration,
        startTime: currentAction.startTime,
      })
    }
    currentAction = undefined
  })

  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_DISCARDED, () => {
    currentAction = undefined
  })

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    previousViews = []
    previousActions = []
    currentView = undefined
    currentAction = undefined
  })

  const clearOldContextsInterval = setInterval(
    monitor(() => {
      clearOldContexts(previousViews, VIEW_CONTEXT_TIME_OUT_DELAY)
      clearOldContexts(previousActions, ACTION_CONTEXT_TIME_OUT_DELAY)
    }),
    CLEAR_OLD_CONTEXTS_INTERVAL
  )

  function clearOldContexts(previousContexts: Array<PreviousContext<unknown>>, timeOutDelay: number) {
    const oldTimeThreshold = performance.now() - timeOutDelay
    while (previousContexts.length > 0 && previousContexts[previousContexts.length - 1].startTime < oldTimeThreshold) {
      previousContexts.pop()
    }
  }

  function buildCurrentViewContext() {
    return {
      session: {
        id: currentSessionId,
      },
      view: {
        id: currentView!.id,
        name: currentView!.name,
        referrer: currentView!.referrer,
        url: currentView!.location.href,
      },
    }
  }

  function buildCurrentActionContext() {
    return { action: { id: currentAction!.id } }
  }

  function findContext<T>(
    buildContext: () => T,
    previousContexts: Array<PreviousContext<T>>,
    currentContext?: { startTime: number },
    startTime?: number
  ) {
    if (startTime === undefined) {
      return currentContext ? buildContext() : undefined
    }
    if (currentContext && startTime >= currentContext.startTime) {
      return buildContext()
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
    findAction: (startTime) => findContext(buildCurrentActionContext, previousActions, currentAction, startTime),
    findView: (startTime) => findContext(buildCurrentViewContext, previousViews, currentView, startTime),
    stop: () => {
      clearInterval(clearOldContextsInterval)
    },
  }
}
