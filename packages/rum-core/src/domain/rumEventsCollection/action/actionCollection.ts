import type { Context, Observable, Duration, RelativeTime, ClocksState } from '@datadog/browser-core'
import {
  assign,
  combine,
  toServerDuration,
  generateUUID,
  monitor,
  elapsed,
  ValueHistory,
  ONE_MINUTE,
  relativeNow,
  includes,
} from '@datadog/browser-core'

import type { RawRumActionEvent, FrustrationType } from '../../../rawRumEvent.types'
import { ActionType, RumEventType } from '../../../rawRumEvent.types'
import type { LifeCycle, RawRumEventCollectedData } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import type { RumConfiguration } from '../../configuration'
import type { CommonContext } from '../../contexts/commonContext'
import type { PageStateHistory } from '../../contexts/pageStateHistory'
import { trackEventCounts } from '../../trackEventCounts'
import { trackClickActions } from './trackClickActions'
import type { MouseEventOnElement } from './listenActionEvents'

interface ActionCounts {
  errorCount: number
  longTaskCount: number
  resourceCount: number
}

export interface ClickAction {
  type: ActionType.CLICK
  id: string
  name: string
  target?: {
    selector: string
    selector_with_stable_attributes?: string
    width: number
    height: number
  }
  position?: { x: number; y: number }
  startClocks: ClocksState
  duration?: Duration
  counts: ActionCounts
  event: MouseEventOnElement
  frustrationTypes: FrustrationType[]
  events: Event[]
}

export interface CustomAction {
  type: ActionType.CUSTOM
  name: string
  startClocks: ClocksState
  context?: Context
}

export interface CustomTiming {
  type: ActionType.TIMING
  id: string
  name: string
  startClocks: ClocksState
  counts: ActionCounts
  context?: Context
  duration?: Duration
}

export type AutoAction = ClickAction

export interface ActionContexts {
  findActionId: (startTime?: RelativeTime) => string | string[] | undefined
}

export type ActionIdHistory = ValueHistory<string>

export const ACTION_CONTEXT_TIME_OUT_DELAY = 5 * ONE_MINUTE // arbitrary

export function startActionCollection(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  configuration: RumConfiguration,
  pageStateHistory: PageStateHistory
) {
  lifeCycle.subscribe(LifeCycleEventType.AUTO_ACTION_COMPLETED, (action) =>
    lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action, pageStateHistory))
  )

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    history.reset()
  })

  const history: ActionIdHistory = new ValueHistory(ACTION_CONTEXT_TIME_OUT_DELAY)
  const actionContexts: ActionContexts = {
    findActionId: (startTime?: RelativeTime) =>
      configuration.trackFrustrations ? history.findAll(startTime) : history.find(startTime),
  }
  if (configuration.trackUserInteractions) {
    trackClickActions(lifeCycle, domMutationObservable, configuration, history)
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
    startAction: (action: CustomTiming) => {
      const historyEntry = history.add(action.id, action.startClocks.relative)
      const eventCountsSubscription = trackEventCounts({
        lifeCycle,
        isChildEvent: (event) =>
          event.action !== undefined &&
          (Array.isArray(event.action.id) ? includes(event.action.id, action.id) : event.action.id === action.id),
      })
      return {
        stop: monitor(() => {
          if (action.duration !== undefined) {
            return
          }
          const end = relativeNow()
          historyEntry.close(end)
          eventCountsSubscription.stop()
          action.duration = elapsed(action.startClocks.relative, end)
          action.counts = eventCountsSubscription.eventCounts
          lifeCycle.notify(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, processAction(action, pageStateHistory))
        }),
      }
    },
    actionContexts,
  }
}

function processAction(
  action: AutoAction | CustomAction | CustomTiming,
  pageStateHistory: PageStateHistory
): RawRumEventCollectedData<RawRumActionEvent> {
  const actionWithDurationProperties = isActionWithDuration(action)
    ? {
        action: {
          id: action.id,
          loading_time: toServerDuration(action.duration),
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
      }
    : undefined
  const autoActionProperties = isAutoAction(action)
    ? {
        action: {
          frustration: {
            type: action.frustrationTypes,
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
      view: { in_foreground: pageStateHistory.isInActivePageStateAt(action.startClocks.relative) },
    },
    actionWithDurationProperties,
    autoActionProperties
  )

  return {
    customerContext,
    rawRumEvent: actionEvent,
    startTime: action.startClocks.relative,
    domainContext: isAutoAction(action) ? { event: action.event, events: action.events } : {},
  }
}

function isAutoAction(action: AutoAction | CustomAction | CustomTiming): action is AutoAction {
  return action.type === ActionType.CLICK
}

function isActionWithDuration(action: AutoAction | CustomAction | CustomTiming): action is AutoAction | CustomTiming {
  return action.type !== ActionType.CUSTOM
}
