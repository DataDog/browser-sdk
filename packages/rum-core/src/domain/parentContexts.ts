import { ONE_MINUTE, RelativeTime, SESSION_TIME_OUT_DELAY, ContextHistory } from '@datadog/browser-core'
import { ActionContext, ViewContext } from '../rawRumEvent.types'
import { LifeCycle, LifeCycleEventType } from './lifeCycle'
import { AutoAction, AutoActionCreatedEvent } from './rumEventsCollection/action/trackActions'
import { ViewCreatedEvent } from './rumEventsCollection/view/trackViews'

export const VIEW_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY
export const ACTION_CONTEXT_TIME_OUT_DELAY = 5 * ONE_MINUTE // arbitrary

export interface ParentContexts {
  findAction: (startTime?: RelativeTime) => ActionContext | undefined
  findView: (startTime?: RelativeTime) => ViewContext | undefined
  stop: () => void
}

export function startParentContexts(lifeCycle: LifeCycle): ParentContexts {
  const viewContextHistory = new ContextHistory<ViewContext>(VIEW_CONTEXT_TIME_OUT_DELAY)

  const actionContextHistory = new ContextHistory<ActionContext>(ACTION_CONTEXT_TIME_OUT_DELAY)

  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (view) => {
    viewContextHistory.setCurrent(buildViewContext(view), view.startClocks.relative)
  })

  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) => {
    // A view can be updated after its end.  We have to ensure that the view being updated is the
    // most recently created.
    const current = viewContextHistory.getCurrent()
    if (current && current.view.id === view.id) {
      viewContextHistory.setCurrent(buildViewContext(view), view.startClocks.relative)
    }
  })

  lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, ({ endClocks }) => {
    viewContextHistory.closeCurrent(endClocks.relative)
  })

  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_CREATED, (action) => {
    actionContextHistory.setCurrent(buildActionContext(action), action.startClocks.relative)
  })

  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, (action: AutoAction) => {
    if (actionContextHistory.getCurrent()) {
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      const actionEndTime = (action.startClocks.relative + action.duration) as RelativeTime
      actionContextHistory.closeCurrent(actionEndTime)
    }
  })

  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_DISCARDED, () => {
    actionContextHistory.clearCurrent()
  })

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    viewContextHistory.reset()
    actionContextHistory.reset()
  })

  function buildViewContext(view: ViewCreatedEvent) {
    return {
      view: {
        id: view.id,
        name: view.name,
      },
    }
  }

  function buildActionContext(action: AutoActionCreatedEvent) {
    return { action: { id: action.id } }
  }

  return {
    findAction: (startTime) => actionContextHistory.find(startTime),
    findView: (startTime) => viewContextHistory.find(startTime),
    stop: () => {
      viewContextHistory.stop()
      actionContextHistory.stop()
    },
  }
}
