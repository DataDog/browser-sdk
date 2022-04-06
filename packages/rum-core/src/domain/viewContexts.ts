import type { RelativeTime } from '@datadog/browser-core'
import { SESSION_TIME_OUT_DELAY, ContextHistory } from '@datadog/browser-core'
import type { ViewContext } from '../rawRumEvent.types'
import type { LifeCycle } from './lifeCycle'
import { LifeCycleEventType } from './lifeCycle'
import type { ViewCreatedEvent } from './rumEventsCollection/view/trackViews'

export const VIEW_CONTEXT_TIME_OUT_DELAY = SESSION_TIME_OUT_DELAY

export interface ViewContexts {
  findView: (startTime?: RelativeTime) => ViewContext | undefined
  stop: () => void
}

export function startViewContexts(lifeCycle: LifeCycle): ViewContexts {
  const viewContextHistory = new ContextHistory<ViewContext>(VIEW_CONTEXT_TIME_OUT_DELAY)

  lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, (view) => {
    viewContextHistory.add(buildViewContext(view), view.startClocks.relative)
  })

  lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, ({ endClocks }) => {
    viewContextHistory.closeActive(endClocks.relative)
  })

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    viewContextHistory.reset()
  })

  function buildViewContext(view: ViewCreatedEvent) {
    return {
      service: view.service,
      version: view.version,
      view: {
        id: view.id,
        name: view.name,
      },
    }
  }

  return {
    findView: (startTime) => viewContextHistory.find(startTime),
    stop: () => {
      viewContextHistory.stop()
    },
  }
}
