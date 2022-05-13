import type { Duration, ClocksState, RelativeTime, TimeStamp } from '@datadog/browser-core'
import {
  setToArray,
  Observable,
  assign,
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
import { waitPageActivityEnd } from '../../waitPageActivityEnd'
import type { RageClickChain } from './rageClickChain'
import { createRageClickChain } from './rageClickChain'
import { getActionNameFromElement } from './getActionNameFromElement'

interface ActionCounts {
  errorCount: number
  longTaskCount: number
  resourceCount: number
}

export interface ClickAction {
  type: ActionType.CLICK
  id: string
  name: string
  startClocks: ClocksState
  duration?: Duration
  counts: ActionCounts
  event: MouseEvent
  frustrationTypes: FrustrationType[]
}

export interface ActionContexts {
  findActionId: (startTime?: RelativeTime) => string | string[] | undefined
}

type ClickActionIdHistory = ContextHistory<ClickAction['id']>

// Maximum duration for click actions
export const CLICK_ACTION_MAX_DURATION = 10 * ONE_SECOND
export const ACTION_CONTEXT_TIME_OUT_DELAY = 5 * ONE_MINUTE // arbitrary

export function trackClickActions(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  { actionNameAttribute, trackFrustrations }: RumConfiguration
) {
  const history: ClickActionIdHistory = new ContextHistory(ACTION_CONTEXT_TIME_OUT_DELAY)
  const stopObservable = new Observable<void>()
  let currentRageClickChain: RageClickChain | undefined

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    history.reset()
  })

  lifeCycle.subscribe(LifeCycleEventType.BEFORE_UNLOAD, stopRageClickChain)
  lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, stopRageClickChain)

  const { stop: stopListener } = listenClickEvents(processClick)

  const actionContexts: ActionContexts = {
    findActionId: (startTime?: RelativeTime) =>
      trackFrustrations ? history.findAll(startTime) : history.find(startTime),
  }

  return {
    stop: () => {
      stopRageClickChain()
      stopObservable.notify()
      stopListener()
    },
    actionContexts,
  }

  function stopRageClickChain() {
    if (currentRageClickChain) {
      currentRageClickChain.stop()
    }
  }

  function processClick(event: MouseEvent & { target: Element }) {
    if (!trackFrustrations && history.find()) {
      // TODO: remove this in a future major version. To keep retrocompatibility, ignore any new
      // action if another one is already occurring.
      return
    }

    const name = getActionNameFromElement(event.target, actionNameAttribute)
    if (!trackFrustrations && !name) {
      // TODO: remove this in a future major version. To keep retrocompatibility, ignore any action
      // with a blank name
      return
    }

    const startClocks = clocksNow()

    const click = newClick(lifeCycle, history, trackFrustrations, {
      name,
      event,
      startClocks,
    })

    if (trackFrustrations && (!currentRageClickChain || !currentRageClickChain.tryAppend(click))) {
      currentRageClickChain = createRageClickChain(click)
    }

    const { stop: stopWaitPageActivityEnd } = waitPageActivityEnd(
      lifeCycle,
      domMutationObservable,
      (pageActivityEndEvent) => {
        if (!pageActivityEndEvent.hadActivity) {
          // If it has no activity, consider it as a dead click.
          // TODO: this will yield a lot of false positive. We'll need to refine it in the future.
          if (trackFrustrations) {
            click.addFrustration(FrustrationType.DEAD)
            click.stop()
          } else {
            click.discard()
          }
        } else if (pageActivityEndEvent.end < startClocks.timeStamp) {
          // If the clock is looking weird, just discard the click
          click.discard()
        } else if (trackFrustrations) {
          // If we track frustrations, let's stop the click, but validate it later
          click.stop(pageActivityEndEvent.end)
        } else {
          // Else just validate it now
          click.validate(pageActivityEndEvent.end)
        }
      },
      CLICK_ACTION_MAX_DURATION
    )

    const viewEndedSubscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, ({ endClocks }) => {
      click.stop(endClocks.timeStamp)
    })

    const stopSubscription = stopObservable.subscribe(() => {
      click.stop()
    })

    click.stopObservable.subscribe(() => {
      viewEndedSubscription.unsubscribe()
      stopWaitPageActivityEnd()
      stopSubscription.unsubscribe()
    })
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

const enum ClickStatus {
  // Initial state, the click is still ongoing.
  ONGOING,
  // The click is no more ongoing but still needs to be validated or discarded.
  STOPPED,
  // Final state, the click has been stopped and validated or discarded.
  FINALIZED,
}

type ClickState =
  | { status: ClickStatus.ONGOING }
  | { status: ClickStatus.STOPPED; endTime?: TimeStamp }
  | { status: ClickStatus.FINALIZED }

export type Click = ReturnType<typeof newClick>

function newClick(
  lifeCycle: LifeCycle,
  history: ClickActionIdHistory,
  trackFrustrations: boolean,
  base: Pick<ClickAction, 'startClocks' | 'event' | 'name'>
) {
  const id = generateUUID()
  const historyEntry = history.add(id, base.startClocks.relative)
  const eventCountsSubscription = trackEventCounts(lifeCycle)
  let state: ClickState = { status: ClickStatus.ONGOING }
  const frustrations = new Set<FrustrationType>()
  const stopObservable = new Observable<void>()

  function stop(endTime?: TimeStamp) {
    if (state.status !== ClickStatus.ONGOING) {
      return
    }
    state = { status: ClickStatus.STOPPED, endTime }
    if (endTime) {
      historyEntry.close(getRelativeTime(endTime))
    } else {
      historyEntry.remove()
    }
    eventCountsSubscription.stop()
    stopObservable.notify()
  }

  function addFrustration(frustration: FrustrationType) {
    if (trackFrustrations) {
      frustrations.add(frustration)
    }
  }

  return {
    event: base.event,
    addFrustration,
    stop,
    stopObservable,

    getFrustrations: () => frustrations,

    isStopped: () => state.status === ClickStatus.STOPPED || state.status === ClickStatus.FINALIZED,

    clone: () => newClick(lifeCycle, history, trackFrustrations, base),

    validate: (endTime?: TimeStamp) => {
      stop(endTime)
      if (state.status !== ClickStatus.STOPPED) {
        return
      }

      if (eventCountsSubscription.eventCounts.errorCount > 0) {
        addFrustration(FrustrationType.ERROR)
      }

      const { resourceCount, errorCount, longTaskCount } = eventCountsSubscription.eventCounts
      const clickAction: ClickAction = assign(
        {
          type: ActionType.CLICK as const,
          duration: state.endTime && elapsed(base.startClocks.timeStamp, state.endTime),
          id,
          frustrationTypes: setToArray(frustrations),
          counts: {
            resourceCount,
            errorCount,
            longTaskCount,
          },
        },
        base
      )
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, clickAction)
      state = { status: ClickStatus.FINALIZED }
    },

    discard: () => {
      stop()
      state = { status: ClickStatus.FINALIZED }
    },
  }
}
