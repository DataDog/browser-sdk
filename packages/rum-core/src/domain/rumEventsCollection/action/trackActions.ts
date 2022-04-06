import type {
  Context,
  Duration,
  ClocksState,
  Observable,
  TimeStamp,
  RelativeTime,
  Subscription,
} from '@datadog/browser-core'
import {
  isExperimentalFeatureEnabled,
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

export interface ActionContexts {
  findActionId: (startTime?: RelativeTime) => string | string[] | undefined
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
    if (!isExperimentalFeatureEnabled('frustration-signals') && history.find()) {
      // Ignore any new action if another one is already occurring.
      return
    }
    const name = getActionNameFromElement(event.target, actionNameAttribute)
    if (!name) {
      return
    }
    const actionController = newAction(
      lifeCycle,
      domMutationObservable,
      ActionType.CLICK,
      name,
      event,
      (endTime) => {
        historyEntry.close(getRelativeTime(endTime))
      },
      () => {
        historyEntry.remove()
      }
    )
    const historyEntry = history.add(actionController, actionController.startClocks.relative)
  })

  const actionContexts: ActionContexts = {
    findActionId: (startTime?: RelativeTime) =>
      isExperimentalFeatureEnabled('frustration-signals')
        ? history.findAll(startTime).map((controller) => controller.id)
        : history.find(startTime)?.id,
  }

  return {
    stop: () => {
      history.findAll().forEach((actionController) => actionController.discard())
      stopListener()
    },
    actionContexts,
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

function newAction(
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
  let viewCreatedSubscription: Subscription | undefined
  if (!isExperimentalFeatureEnabled('frustration-signals')) {
    // New views trigger the discard of the current pending Action
    viewCreatedSubscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, discard)
  }

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
    if (viewCreatedSubscription) {
      viewCreatedSubscription.unsubscribe()
    }
  }

  return {
    discard,
    id,
    startClocks,
  }
}
