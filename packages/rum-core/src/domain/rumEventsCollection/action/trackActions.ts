import type { Context, Duration, ClocksState, RelativeTime, TimeStamp, Subscription } from '@datadog/browser-core'
import {
  Observable,
  assign,
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
import { FrustrationType, ActionType } from '../../../rawRumEvent.types'
import type { RumConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import { trackEventCounts } from '../../trackEventCounts'
import { waitIdlePage } from '../../waitIdlePage'
import { getActionNameFromElement } from './getActionNameFromElement'

type AutoActionType = ActionType.CLICK

interface ActionCounts {
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
  frustrationTypes: FrustrationType[]
}

export interface ActionContexts {
  findActionId: (startTime?: RelativeTime) => string | string[] | undefined
}

// Maximum duration for automatic actions
export const AUTO_ACTION_MAX_DURATION = 10 * ONE_SECOND
export const ACTION_CONTEXT_TIME_OUT_DELAY = 5 * ONE_MINUTE // arbitrary

export function trackActions(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  { actionNameAttribute }: RumConfiguration
) {
  // TODO: this will be changed when we introduce a proper initialization parameter for it
  const collectFrustrations = isExperimentalFeatureEnabled('frustration-signals')
  const history = new ContextHistory<string>(ACTION_CONTEXT_TIME_OUT_DELAY)
  const stopObservable = new Observable<void>()

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    history.reset()
  })

  const { stop: stopListener } = listenClickEvents(onClick)

  const actionContexts: ActionContexts = {
    findActionId: (startTime?: RelativeTime) =>
      isExperimentalFeatureEnabled('frustration-signals') ? history.findAll(startTime) : history.find(startTime),
  }

  return {
    stop: () => {
      stopObservable.notify()
      stopListener()
    },
    actionContexts,
  }

  function onClick(event: MouseEvent & { target: Element }) {
    if (!collectFrustrations && history.find()) {
      // TODO: remove this in a future major version. To keep retrocompatibility, ignore any new
      // action if another one is already occurring.
      return
    }

    const name = getActionNameFromElement(event.target, actionNameAttribute)
    if (!collectFrustrations && !name) {
      // TODO: remove this in a future major version. To keep retrocompatibility, ignore any action
      // with a blank name
      return
    }

    const startClocks = clocksNow()

    const singleClickPotentialAction = newPotentialAction(lifeCycle, history, collectFrustrations, {
      name,
      event,
      type: ActionType.CLICK as const,
      startClocks,
    })

    const { stop: stopWaitingIdlePage } = waitIdlePage(
      lifeCycle,
      domMutationObservable,
      (idleEvent) => {
        if (!idleEvent.hadActivity) {
          // If it has no activity, consider it as a dead click.
          // TODO: this will yield a lot of false positive. We'll need to refine it in the future.
          if (collectFrustrations) {
            singleClickPotentialAction.frustrations.add(FrustrationType.DEAD)
            singleClickPotentialAction.complete(startClocks.timeStamp)
          } else {
            singleClickPotentialAction.discard()
          }
        } else if (idleEvent.end < startClocks.timeStamp) {
          // If the clock is looking weird, just discard the action
          singleClickPotentialAction.discard()
        } else {
          // Else complete the action at the end of the page activity
          singleClickPotentialAction.complete(idleEvent.end)
        }
        endClick()
      },
      AUTO_ACTION_MAX_DURATION
    )

    let viewCreatedSubscription: Subscription | undefined
    if (!collectFrustrations) {
      // TODO: remove this in a future major version. To keep retrocompatibility, end the action on a
      // new view is created.
      viewCreatedSubscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_CREATED, endClick)
    }

    const stopSubscription = stopObservable.subscribe(endClick)

    function endClick() {
      singleClickPotentialAction.notifyIfComplete()

      // Cleanup any ongoing process
      singleClickPotentialAction.discard()
      if (viewCreatedSubscription) {
        viewCreatedSubscription.unsubscribe()
      }
      stopWaitingIdlePage()
      stopSubscription.unsubscribe()
    }
  }
}

function listenClickEvents(callback: (clickEvent: MouseEvent & { target: Element }) => void) {
  return addEventListener(
    window,
    DOM_EVENT.CLICK,
    (clickEvent: MouseEvent) => {
      if (clickEvent.target instanceof Element) {
        callback(clickEvent as MouseEvent & { target: Element })
      }
    },
    { capture: true }
  )
}

function newPotentialAction(
  lifeCycle: LifeCycle,
  history: ContextHistory<string>,
  collectFrustrations: boolean,
  base: Pick<AutoAction, 'startClocks' | 'event' | 'name' | 'type'>
) {
  const id = generateUUID()
  const historyEntry = history.add(id, base.startClocks.relative)
  const eventCountsSubscription = trackEventCounts(lifeCycle)
  let finalState: { isDiscarded: false; endTime: TimeStamp } | { isDiscarded: true } | undefined
  const frustrations = new Set<FrustrationType>()

  return {
    base,
    frustrations,

    complete: (endTime: TimeStamp) => {
      if (finalState) {
        return
      }
      finalState = { isDiscarded: false, endTime }
      historyEntry.close(getRelativeTime(endTime))
      eventCountsSubscription.stop()
      if (eventCountsSubscription.eventCounts.errorCount > 0) {
        frustrations.add(FrustrationType.ERROR)
      }
    },

    discard: () => {
      if (finalState) {
        return
      }
      finalState = { isDiscarded: true }
      historyEntry.remove()
      eventCountsSubscription.stop()
    },

    notifyIfComplete: () => {
      if (!finalState || finalState.isDiscarded) {
        return
      }

      const frustrationTypes: FrustrationType[] = []
      if (collectFrustrations) {
        frustrations.forEach((frustration) => {
          frustrationTypes.push(frustration)
        })
      }
      const { resourceCount, errorCount, longTaskCount } = eventCountsSubscription.eventCounts
      const action: AutoAction = assign(
        {
          duration: elapsed(base.startClocks.timeStamp, finalState.endTime),
          id,
          frustrationTypes,
          counts: {
            resourceCount,
            errorCount,
            longTaskCount,
          },
        },
        base
      )
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, action)
    },
  }
}
