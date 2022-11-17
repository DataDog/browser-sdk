import type { Context, RelativeTime } from '@datadog/browser-core'
import { SESSION_TIME_OUT_DELAY, ContextHistory } from '@datadog/browser-core'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { ViewCreatedEvent, ViewEvent } from '../rumEventsCollection/view/trackViews'

export const VIEW_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY

export interface ViewContext {
  service?: string
  version?: string
  id: string
  name?: string
  featureFlags?: Context
}

export interface ViewContexts {
  findView: (startTime?: RelativeTime) => ViewContext | undefined
  stop: () => void
}

export function startViewContexts(lifeCycle: LifeCycle): ViewContexts {
  const viewContextHistory = new ContextHistory<ViewContext>(VIEW_CONTEXT_TIME_OUT_DELAY)

  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (view) => {
    viewContextHistory.add(buildViewContext(view), view.startClocks.relative)
  })

  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) => {
    viewContextHistory.add(buildViewContext(view), view.startClocks.relative)
  })
  lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, ({ endClocks }) => {
    viewContextHistory.closeActive(endClocks.relative)
  })

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    viewContextHistory.reset()
  })

  function buildViewContext(view: ViewCreatedEvent | ViewEvent) {
    return {
      service: view.service,
      version: view.version,
      id: view.id,
      name: view.name,
      featureFlags: 'featureFlags' in view ? view.featureFlags : undefined,
    }
  }

  return {
    findView: (startTime) => viewContextHistory.find(startTime),
    stop: () => {
      viewContextHistory.stop()
    },
  }
}
