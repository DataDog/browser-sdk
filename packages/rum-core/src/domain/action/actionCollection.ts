import type { ClocksState, Context, Observable } from '@datadog/browser-core'
import { noop, assign, combine, toServerDuration, generateUUID } from '@datadog/browser-core'

import { discardNegativeDuration } from '../discardNegativeDuration'
import type { RawRumActionEvent } from '../../rawRumEvent.types'
import { ActionType, RumEventType } from '../../rawRumEvent.types'
import type { LifeCycle, RawRumEventCollectedData } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import type { RumConfiguration } from '../configuration'
import type { CommonContext } from '../contexts/commonContext'
import type { PageStateHistory } from '../contexts/pageStateHistory'
import { PageState } from '../contexts/pageStateHistory'
import type { RumActionEventDomainContext } from '../../domainContext.types'
import type { ActionContexts, ClickAction } from './trackClickActions'
import { trackClickActions } from './trackClickActions'

export type { ActionContexts }

export interface CustomAction {
  type: ActionType.CUSTOM
  name: string
  startClocks: ClocksState
  context?: Context
  handlingStack?: string
}

export type AutoAction = ClickAction

export function startActionCollection(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  configuration: RumConfiguration,
  pageStateHistory: PageStateHistory
) {
  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, (action) =>
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action, pageStateHistory))
  )

  let actionContexts: ActionContexts = { findActionId: noop as () => undefined }
  if (configuration.trackUserInteractions) {
    actionContexts = trackClickActions(lifeCycle, domMutationObservable, configuration).actionContexts
  }

  return {
    addAction: (action: CustomAction, savedCommonContext?: CommonContext) => {
      lifeCycle.notify(
        LifeCycleEventType.RAW_RUM_EVENT_COLLECTED,
        assign(
          {
            savedCommonContext,
          },
          processAction(action, pageStateHistory)
        )
      )
    },
    actionContexts,
  }
}

function processAction(
  action: AutoAction | CustomAction,
  pageStateHistory: PageStateHistory
): RawRumEventCollectedData<RawRumActionEvent> {
  const autoActionProperties = isAutoAction(action)
    ? {
        action: {
          id: action.id,
          loading_time: discardNegativeDuration(toServerDuration(action.duration)),
          frustration: {
            type: action.frustrationTypes,
          },
          error: {
            count: action.counts.errorCount,
          },
          long_task: {
            count: action.counts.longTaskCount,
          },
          resource: {
            count: action.counts.resourceCount,
          },
        },
        _dd: {
          action: {
            target: action.target,
            position: action.position,
          },
        },
      }
    : undefined
  const customerContext = !isAutoAction(action) ? action.context : undefined
  const actionEvent: RawRumActionEvent = combine(
    {
      action: {
        id: generateUUID(),
        target: {
          name: action.name,
        },
        type: action.type,
      },
      date: action.startClocks.timeStamp,
      type: RumEventType.ACTION as const,
      view: { in_foreground: pageStateHistory.wasInPageStateAt(PageState.ACTIVE, action.startClocks.relative) },
    },
    autoActionProperties
  )

  const domainContext: RumActionEventDomainContext = isAutoAction(action) ? { events: action.events } : {}

  if (!isAutoAction(action) && action.handlingStack) {
    domainContext.handlingStack = action.handlingStack
  }

  return {
    customerContext,
    rawRumEvent: actionEvent,
    startTime: action.startClocks.relative,
    domainContext,
  }
}

function isAutoAction(action: AutoAction | CustomAction): action is AutoAction {
  return action.type !== ActionType.CUSTOM
}
