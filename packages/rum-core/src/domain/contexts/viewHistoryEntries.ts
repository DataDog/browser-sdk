import type { RelativeTime, ClocksState, Context } from '@datadog/browser-core'
import { SESSION_TIME_OUT_DELAY, createValueHistory } from '@datadog/browser-core'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { ViewCreatedEvent, ViewEvent } from '../view/trackViews'

export const VIEW_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY

export interface ViewHistoryEntry {
  service?: string
  version?: string
  customerContext?: Context | undefined
  id: string
  name?: string
  startClocks: ClocksState
}

export interface ViewHistoryEntries {
  findView: (startTime?: RelativeTime) => ViewHistoryEntry | undefined
  stop: () => void
}

export function startViewHistoryEntries(lifeCycle: LifeCycle): ViewHistoryEntries {
  const viewValueHistory = createValueHistory<ViewHistoryEntry>({ expireDelay: VIEW_CONTEXT_TIME_OUT_DELAY })

  lifeCycle.subscribe(LifeCycleEventType.BEFORE_VIEW_CREATED, (view) => {
    viewValueHistory.add(buildViewHistoryEntry(view), view.startClocks.relative)
  })

  lifeCycle.subscribe(LifeCycleEventType.AFTER_VIEW_ENDED, ({ endClocks }) => {
    viewValueHistory.closeActive(endClocks.relative)
  })

  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (viewUpdate: ViewEvent) => {
    const currentView = viewValueHistory.find(viewUpdate.startClocks.relative)
    if (currentView && viewUpdate.name) {
      currentView.name = viewUpdate.name
    }
  })

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    viewValueHistory.reset()
  })

  function buildViewHistoryEntry(view: ViewCreatedEvent) {
    return {
      service: view.service,
      version: view.version,
      customerContext: view.context,
      id: view.id,
      name: view.name,
      startClocks: view.startClocks,
    }
  }

  return {
    findView: (startTime) => viewValueHistory.find(startTime),
    stop: () => {
      viewValueHistory.stop()
    },
  }
}
