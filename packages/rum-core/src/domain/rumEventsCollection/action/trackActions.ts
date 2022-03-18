import type { Context, Duration, ClocksState, Observable, TimeStamp, RelativeTime } from '@datadog/browser-core'
import {
  getRelativeTime,
  ONE_MINUTE,
  ContextHistory,
  addEventListener,
  DOM_EVENT,
  generateUUID,
  clocksNow,
  ONE_SECOND,
  elapsed,
} from '@datadog/browser-core'
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
export const ACTION_CONTEXT_TIME_OUT_DELAY = 5 * ONE_MINUTE // arbitrary

interface ActionController {
  id: string
  startClocks: ClocksState
  discard(): void
}

export function trackActions(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  { actionNameAttribute }: RumConfiguration
) {
  const history = new ContextHistory<ActionController>(ACTION_CONTEXT_TIME_OUT_DELAY)

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    history.reset()
  })

  const { stop: stopListener } = listenEvents((event) => {
    if (history.getCurrent()) {
      // Ignore any new action if another one is already occurring.
      return
    }
    const name = getActionNameFromElement(event.target, actionNameAttribute)
    if (!name) {
      return
    }
    const actionController = createAction(
      lifeCycle,
      domMutationObservable,
      ActionType.CLICK,
      name,
      event,
      (endTime) => {
        history.closeCurrent(getRelativeTime(endTime))
      },
      () => {
        history.clearCurrent()
      }
    )
    history.setCurrent(actionController, actionController.startClocks.relative)
  })

  return {
    stop: () => {
      const currentAction = history.getCurrent()
      if (currentAction) {
        currentAction.discard()
      }
      stopListener()
    },
    findActionId: (startTime?: RelativeTime) => history.find(startTime)?.id,
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
  onCompleteCallback: (endTime: TimeStamp) => void,
  onDiscardCallback: () => void
): ActionController {
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
    onCompleteCallback(endTime)
  }

  function discard() {
    cleanup()
    onDiscardCallback()
  }

  function cleanup() {
    stopWaitingIdlePage()
    eventCountsSubscription.stop()
    viewCreatedSubscription.unsubscribe()
  }

  return {
    discard,
    id,
    startClocks,
  }
}
