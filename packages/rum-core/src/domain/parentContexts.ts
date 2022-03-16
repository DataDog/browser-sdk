import type { ContextHistoryEntry, RelativeTime } from '@datadog/browser-core'
import { isExperimentalFeatureEnabled, ONE_MINUTE, SESSION_TIME_OUT_DELAY, ContextHistory } from '@datadog/browser-core'
import type { ActionContext, ViewContext } from '../rawRumEvent.types'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { AutoAction, AutoActionCreatedEvent } from './rumEventsCollection/action/trackActions'
import type { ViewCreatedEvent } from './rumEventsCollection/view/trackViews'

export const VIEW_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY
export const ACTION_CONTEXT_TIME_OUT_DELAY = 5 * ONE_MINUTE // arbitrary

export interface ParentContexts {
  findAction: (startTime?: RelativeTime) => ActionContext | undefined
  findView: (startTime?: RelativeTime) => ViewContext | undefined
  stop: () => void
}

export function startParentContexts(lifeCycle: LifeCycle): ParentContexts {
  const viewContextHistory = startViewHistory(lifeCycle)
  const actionContextHistory = startActionHistory(lifeCycle)

  return {
    findAction: (startTime) => actionContextHistory.find(startTime),
    findView: (startTime) => viewContextHistory.find(startTime),
    stop: () => {
      viewContextHistory.stop()
      actionContextHistory.stop()
    },
  }
}

function startViewHistory(lifeCycle: LifeCycle) {
  const viewContextHistory = new ContextHistory<ViewContext>(VIEW_CONTEXT_TIME_OUT_DELAY)

  let currentHistoryEntry: ContextHistoryEntry<ViewContext>

  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (view) => {
    currentHistoryEntry = viewContextHistory.add(buildViewContext(view), view.startClocks.relative)
  })

  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) => {
    // A view can be updated after its end.  We have to ensure that the view being updated is the
    // most recently created.
    if (currentHistoryEntry.context.view.id === view.id) {
      currentHistoryEntry.context = buildViewContext(view)
    }
  })

  lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, ({ endClocks }) => {
    currentHistoryEntry.close(endClocks.relative)
  })

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    viewContextHistory.reset()
  })

  function buildViewContext(view: ViewCreatedEvent) {
    return {
      view: {
        id: view.id,
        name: view.name,
      },
    }
  }

  return viewContextHistory
}

function startActionHistory(lifeCycle: LifeCycle) {
  const actionContextHistory = new ContextHistory<ActionContext>(ACTION_CONTEXT_TIME_OUT_DELAY)
  let currentHistoryEntry: ContextHistoryEntry<ActionContext>

  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_CREATED, (action) => {
    currentHistoryEntry = actionContextHistory.add(buildActionContext(action), action.startClocks.relative)
  })

  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, (action: AutoAction) => {
    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
    const actionEndTime = (action.startClocks.relative + action.duration) as RelativeTime
    currentHistoryEntry.close(actionEndTime)
  })

  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_DISCARDED, () => {
    currentHistoryEntry.remove()
  })

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    actionContextHistory.reset()
  })

  function buildActionContext(action: AutoActionCreatedEvent): ActionContext {
    if (isExperimentalFeatureEnabled('frustration-signals')) {
      return { action: { id: [action.id] } }
    }
    return { action: { id: action.id } }
  }

  return actionContextHistory
}
