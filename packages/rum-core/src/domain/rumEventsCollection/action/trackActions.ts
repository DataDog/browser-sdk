import type { Context, Duration, ClocksState, Observable, TimeStamp } from '@datadog/browser-core'
import { addEventListener, DOM_EVENT, generateUUID, clocksNow, ONE_SECOND, elapsed } from '@datadog/browser-core'
import { ActionType } from '../../../rawRumEvent.types'
import type { RumConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import { trackEventCounts } from '../../trackEventCounts'
import { waitIdlePage } from '../../waitIdlePage'
import { getActionNameFromElement } from './getActionNameFromElement'

type AutoActionType = ActionType.CLICK

export interface ActionCounts {
  errorCount: number
  longTaskCount: number
  resourceCount: number
}

export interface CustomAction {
  type: ActionType.CUSTOM
  name: string
  startClocks: ClocksState
  context?: Context
}

export interface AutoAction {
  type: AutoActionType
  id: string
  name: string
  startClocks: ClocksState
  duration: Duration
  counts: ActionCounts
  event: Event
}

export interface AutoActionCreatedEvent {
  id: string
  startClocks: ClocksState
}

// Maximum duration for automatic actions
export const AUTO_ACTION_MAX_DURATION = 10 * ONE_SECOND

export function trackActions(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  { actionNameAttribute }: RumConfiguration
) {
  let currentAction: { discard(): void } | undefined

  const { stop: stopListener } = listenEvents((event) => {
    if (currentAction) {
      // Ignore any new action if another one is already occurring.
      return
    }
    const name = getActionNameFromElement(event.target, actionNameAttribute)
    if (!name) {
      return
    }
    currentAction = createAction(
      lifeCycle,
      domMutationObservable,
      ActionType.CLICK,
      name,
      event,
      () => {
        currentAction = undefined
      },
      () => {
        currentAction = undefined
      }
    )
  })

  return {
    stop() {
      if (currentAction) {
        currentAction.discard()
      }
      stopListener()
    },
  }
}

function listenEvents(callback: (event: Event & { target: Element }) => void) {
  return addEventListener(
    window,
    DOM_EVENT.CLICK,
    (event) => {
      if (event.target instanceof Element) {
        callback(event as Event & { target: Element })
      }
    },
    { capture: true }
  )
}

function createAction(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  type: AutoActionType,
  name: string,
  event: Event,
  onCompleteCallback: () => void,
  onDiscardCallback: () => void
) {
  const id = generateUUID()
  const startClocks = clocksNow()
  const eventCountsSubscription = trackEventCounts(lifeCycle)
  const { stop: stopWaitingIdlePage } = waitIdlePage(
    lifeCycle,
    domMutationObservable,
    (idleEvent) => {
      if (idleEvent.hadActivity && startClocks.timeStamp <= idleEvent.end) {
        complete(idleEvent.end)
      } else {
        discard()
      }
    },
    AUTO_ACTION_MAX_DURATION
  )
  // New views trigger the discard of the current pending Action
  const viewCreatedSubscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, discard)

  lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_CREATED, { id, startClocks })

  function complete(endTime: TimeStamp) {
    cleanup()
    const eventCounts = eventCountsSubscription.eventCounts
    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, {
      counts: {
        errorCount: eventCounts.errorCount,
        longTaskCount: eventCounts.longTaskCount,
        resourceCount: eventCounts.resourceCount,
      },
      duration: elapsed(startClocks.timeStamp, endTime),
      id,
      name,
      startClocks,
      type,
      event,
    })
    onCompleteCallback()
  }

  function discard() {
    cleanup()
    lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_DISCARDED)
    onDiscardCallback()
  }

  function cleanup() {
    stopWaitingIdlePage()
    eventCountsSubscription.stop()
    viewCreatedSubscription.unsubscribe()
  }

  return {
    discard,
  }
}
