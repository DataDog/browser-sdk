import type { ContextHistoryEntry, RelativeTime } from '@datadog/browser-core'
import { isExperimentalFeatureEnabled, ONE_MINUTE, SESSION_TIME_OUT_DELAY, ContextHistory } from '@datadog/browser-core'
import type { ActionContext, ViewContext } from '../rawRumEvent.types'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { AutoAction } from './rumEventsCollection/action/trackActions'
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
  const actionContextHistory = new ContextHistory<string>(ACTION_CONTEXT_TIME_OUT_DELAY)
  const currentHistoryEntries = new Map<string, ContextHistoryEntry<string>>()

  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_CREATED, (action) => {
    currentHistoryEntries.set(action.id, actionContextHistory.add(action.id, action.startClocks.relative))
  })

  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, (action: AutoAction) => {
    removeHistoryEntry(action.id, (historyEntry) => {
      // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
      const actionEndTime = (action.startClocks.relative + action.duration) as RelativeTime
      historyEntry.close(actionEndTime)
    })
  })

  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_DISCARDED, (action) => {
    removeHistoryEntry(action.id, (historyEntry) => historyEntry.remove())
  })

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    currentHistoryEntries.clear()
    actionContextHistory.reset()
  })

  function removeHistoryEntry(id: string, callback: (entry: ContextHistoryEntry<string>) => void) {
    const historyEntry = currentHistoryEntries.get(id)
    if (historyEntry) {
      currentHistoryEntries.delete(id)
      callback(historyEntry)
    }
  }

  return {
    find(startTime?: RelativeTime) {
      if (isExperimentalFeatureEnabled('frustration-signals')) {
        const ids = actionContextHistory.findAll(startTime)
        return ids.length > 0 ? { action: { id: ids } } : undefined
      }
      const id = actionContextHistory.find(startTime)
      return id === undefined ? undefined : { action: { id } }
    },
    stop() {
      actionContextHistory.stop()
    },
  }
}
