import { ONE_MINUTE, RelativeTime, SESSION_TIME_OUT_DELAY, relativeToClocks } from '@datadog/browser-core'
import { ActionContext, ViewContext } from '../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { AutoAction, AutoActionCreatedEvent } from './rumEventsCollection/action/trackActions'
import { ViewCreatedEvent } from './rumEventsCollection/view/trackViews'
import { RumSession } from './rumSession'
import { ContextHistory } from './contextHistory'

export const VIEW_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY
export const ACTION_CONTEXT_TIME_OUT_DELAY = 5 * ONE_MINUTE // arbitrary

export interface ParentContexts {
  findAction: (startTime?: RelativeTime) => ActionContext | undefined
  findView: (startTime?: RelativeTime) => ViewContext | undefined
  stop: () => void
}

export function startParentContexts(lifeCycle: LifeCycle, session: RumSession): ParentContexts {
  const viewContextHistory = new ContextHistory<ViewCreatedEvent & { sessionId?: string }, ViewContext>(
    buildCurrentViewContext,
    VIEW_CONTEXT_TIME_OUT_DELAY
  )

  const actionContextHistory = new ContextHistory<AutoActionCreatedEvent, ActionContext>(
    buildCurrentActionContext,
    ACTION_CONTEXT_TIME_OUT_DELAY
  )

  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (view) => {
    viewContextHistory.current = {
      sessionId: session.getId(),
      ...view,
    }
  })

  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) => {
    // A view can be updated after its end.  We have to ensure that the view being updated is the
    // most recently created.
    if (viewContextHistory.current && viewContextHistory.current.id === view.id) {
      viewContextHistory.current = {
        sessionId: viewContextHistory.current.sessionId,
        ...view,
      }
    }
  })

  lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, ({ endClocks }) => {
    viewContextHistory.closeCurrent(endClocks)
    viewContextHistory.current = undefined
  })

  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_CREATED, (action) => {
    actionContextHistory.current = action
  })

  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, (action: AutoAction) => {
    if (actionContextHistory.current) {
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      const actionEndTime = (actionContextHistory.current.startClocks.relative + action.duration) as RelativeTime
      actionContextHistory.closeCurrent(relativeToClocks(actionEndTime))
      actionContextHistory.current = undefined
    }
  })

  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_DISCARDED, () => {
    actionContextHistory.current = undefined
  })

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    viewContextHistory.reset()
    actionContextHistory.reset()
  })

  function buildCurrentViewContext(current: ViewCreatedEvent & { sessionId?: string }) {
    return {
      session: {
        id: current.sessionId,
      },
      view: {
        id: current.id,
        name: current.name,
        referrer: current.referrer,
        url: current.location.href,
      },
    }
  }

  function buildCurrentActionContext(current: AutoActionCreatedEvent) {
    return { action: { id: current.id } }
  }

  return {
    findAction: (startTime) =>
      actionContextHistory.find(startTime !== undefined ? relativeToClocks(startTime) : undefined),
    findView: (startTime) => viewContextHistory.find(startTime !== undefined ? relativeToClocks(startTime) : undefined),
    stop: () => {
      viewContextHistory.stop()
      actionContextHistory.stop()
    },
  }
}
