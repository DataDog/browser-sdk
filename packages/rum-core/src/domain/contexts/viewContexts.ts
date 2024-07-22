import type { RelativeTime, ClocksState } from '@datadog/browser-core'
import { SESSION_TIME_OUT_DELAY, valueHistoryFactory } from '@datadog/browser-core'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { ViewCreatedEvent, ViewEvent } from '../view/trackViews'

export const VIEW_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY

export interface ViewContext {
  service?: string
  version?: string
  id: string
  name?: string
  startClocks: ClocksState
}

export interface ViewContexts {
  findView: (startTime?: RelativeTime) => ViewContext | undefined
  stop: () => void
}

export function startViewContexts(lifeCycle: LifeCycle): ViewContexts {
  const viewContextHistory = valueHistoryFactory<ViewContext>({ expireDelay: VIEW_CONTEXT_TIME_OUT_DELAY })

  lifeCycle.subscribe(LifeCycleEventType.BEFORE_VIEW_CREATED, (view) => {
    viewContextHistory.add(buildViewContext(view), view.startClocks.relative)
  })

  lifeCycle.subscribe(LifeCycleEventType.AFTER_VIEW_ENDED, ({ endClocks }) => {
    viewContextHistory.closeActive(endClocks.relative)
  })

  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (viewUpdate: ViewEvent) => {
    const currentView = viewContextHistory.find(viewUpdate.startClocks.relative)
    if (currentView && viewUpdate.name) {
      currentView.name = viewUpdate.name
    }
  })

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    viewContextHistory.reset()
  })

  function buildViewContext(view: ViewCreatedEvent) {
    return {
      service: view.service,
      version: view.version,
      id: view.id,
      name: view.name,
      startClocks: view.startClocks,
    }
  }

  return {
    findView: (startTime) => viewContextHistory.find(startTime),
    stop: () => {
      viewContextHistory.stop()
    },
  }
}
