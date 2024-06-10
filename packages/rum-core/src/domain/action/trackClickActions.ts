import type { Duration, ClocksState, RelativeTime, TimeStamp } from '@datadog/browser-core'
import {
  includes,
  timeStampNow,
  Observable,
  assign,
  getRelativeTime,
  ONE_MINUTE,
  ValueHistory,
  generateUUID,
  clocksNow,
  ONE_SECOND,
  elapsed,
} from '@datadog/browser-core'
import type { FrustrationType } from '../../rawRumEvent.types'
import { ActionType } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { trackEventCounts } from '../trackEventCounts'
import { PAGE_ACTIVITY_VALIDATION_DELAY, waitPageActivityEnd } from '../waitPageActivityEnd'
import { getSelectorFromElement } from '../getSelectorFromElement'
import { getNodePrivacyLevel, NodePrivacyLevel } from '../privacy'
import type { RumConfiguration } from '../configuration'
import type { ClickChain } from './clickChain'
import { createClickChain } from './clickChain'
import { getActionNameFromElement } from './getActionNameFromElement'
import type { MouseEventOnElement, UserActivity } from './listenActionEvents'
import { listenActionEvents } from './listenActionEvents'
import { computeFrustration } from './computeFrustration'

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
    selector: string | undefined
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

export interface ActionContexts {
  findActionId: (startTime?: RelativeTime) => string | string[] | undefined
}

type ClickActionIdHistory = ValueHistory<ClickAction['id']>

// Maximum duration for click actions
export const CLICK_ACTION_MAX_DURATION = 10 * ONE_SECOND
export const ACTION_CONTEXT_TIME_OUT_DELAY = 5 * ONE_MINUTE // arbitrary

export function trackClickActions(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  configuration: RumConfiguration
) {
  const history: ClickActionIdHistory = new ValueHistory(ACTION_CONTEXT_TIME_OUT_DELAY)
  const stopObservable = new Observable<void>()
  let currentClickChain: ClickChain | undefined

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    history.reset()
  })

  lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, stopClickChain)

  const { stop: stopActionEventsListener } = listenActionEvents<{
    clickActionBase: ClickActionBase
    hadActivityOnPointerDown: () => boolean
  }>(configuration, {
    onPointerDown: (pointerDownEvent) =>
      processPointerDown(configuration, lifeCycle, domMutationObservable, pointerDownEvent),
    onPointerUp: ({ clickActionBase, hadActivityOnPointerDown }, startEvent, getUserActivity) => {
      startClickAction(
        configuration,
        lifeCycle,
        domMutationObservable,
        history,
        stopObservable,
        appendClickToClickChain,
        clickActionBase,
        startEvent,
        getUserActivity,
        hadActivityOnPointerDown
      )
    },
  })

  const actionContexts: ActionContexts = {
    findActionId: (startTime?: RelativeTime) => history.findAll(startTime),
  }

  return {
    stop: () => {
      stopClickChain()
      stopObservable.notify()
      stopActionEventsListener()
    },
    actionContexts,
  }

  function appendClickToClickChain(click: Click) {
    if (!currentClickChain || !currentClickChain.tryAppend(click)) {
      const rageClick = click.clone()
      currentClickChain = createClickChain(click, (clicks) => {
        finalizeClicks(clicks, rageClick)
      })
    }
  }

  function stopClickChain() {
    if (currentClickChain) {
      currentClickChain.stop()
    }
  }
}

function processPointerDown(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  pointerDownEvent: MouseEventOnElement
) {
  const nodePrivacyLevel = configuration.enablePrivacyForActionName
    ? getNodePrivacyLevel(pointerDownEvent.target, configuration.defaultPrivacyLevel)
    : NodePrivacyLevel.ALLOW

  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    return undefined
  }

  const clickActionBase = computeClickActionBase(pointerDownEvent, nodePrivacyLevel, configuration)

  let hadActivityOnPointerDown = false

  waitPageActivityEnd(
    lifeCycle,
    domMutationObservable,
    configuration,
    (pageActivityEndEvent) => {
      hadActivityOnPointerDown = pageActivityEndEvent.hadActivity
    },
    // We don't care about the activity duration, we just want to know whether an activity did happen
    // within the "validation delay" or not. Limit the duration so the callback is called sooner.
    PAGE_ACTIVITY_VALIDATION_DELAY
  )

  return { clickActionBase, hadActivityOnPointerDown: () => hadActivityOnPointerDown }
}

function startClickAction(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<void>,
  history: ClickActionIdHistory,
  stopObservable: Observable<void>,
  appendClickToClickChain: (click: Click) => void,
  clickActionBase: ClickActionBase,
  startEvent: MouseEventOnElement,
  getUserActivity: () => UserActivity,
  hadActivityOnPointerDown: () => boolean
) {
  const click = newClick(lifeCycle, history, getUserActivity, clickActionBase, startEvent)
  appendClickToClickChain(click)

  const { stop: stopWaitPageActivityEnd } = waitPageActivityEnd(
    lifeCycle,
    domMutationObservable,
    configuration,
    (pageActivityEndEvent) => {
      if (pageActivityEndEvent.hadActivity && pageActivityEndEvent.end < click.startClocks.timeStamp) {
        // If the clock is looking weird, just discard the click
        click.discard()
      } else {
        if (pageActivityEndEvent.hadActivity) {
          click.stop(pageActivityEndEvent.end)
        } else if (hadActivityOnPointerDown()) {
          click.stop(
            // using the click start as activity end, so the click will have some activity but its
            // duration will be 0 (as the activity started before the click start)
            click.startClocks.timeStamp
          )
        } else {
          click.stop()
        }
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

type ClickActionBase = Pick<ClickAction, 'type' | 'name' | 'target' | 'position'>

function computeClickActionBase(
  event: MouseEventOnElement,
  nodePrivacyLevel: NodePrivacyLevel,
  configuration: RumConfiguration
): ClickActionBase {
  const rect = event.target.getBoundingClientRect()

  return {
    type: ActionType.CLICK,
    target: {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      selector: getSelectorFromElement(event.target, configuration.actionNameAttribute),
    },
    position: {
      // Use clientX and Y because for SVG element offsetX and Y are relatives to the <svg> element
      x: Math.round(event.clientX - rect.left),
      y: Math.round(event.clientY - rect.top),
    },
    name: getActionNameFromElement(event.target, configuration, nodePrivacyLevel),
  }
}

const enum ClickStatus {
  // Initial state, the click is still ongoing.
  ONGOING,
  // The click is no more ongoing but still needs to be validated or discarded.
  STOPPED,
  // Final state, the click has been stopped and validated or discarded.
  FINALIZED,
}

export type Click = ReturnType<typeof newClick>

function newClick(
  lifeCycle: LifeCycle,
  history: ClickActionIdHistory,
  getUserActivity: () => UserActivity,
  clickActionBase: ClickActionBase,
  startEvent: MouseEventOnElement
) {
  const id = generateUUID()
  const startClocks = clocksNow()
  const historyEntry = history.add(id, startClocks.relative)
  const eventCountsSubscription = trackEventCounts({
    lifeCycle,
    isChildEvent: (event) =>
      event.action !== undefined &&
      (Array.isArray(event.action.id) ? includes(event.action.id, id) : event.action.id === id),
  })
  let status = ClickStatus.ONGOING
  let activityEndTime: undefined | TimeStamp
  const frustrationTypes: FrustrationType[] = []
  const stopObservable = new Observable<void>()

  function stop(newActivityEndTime?: TimeStamp) {
    if (status !== ClickStatus.ONGOING) {
      return
    }
    activityEndTime = newActivityEndTime
    status = ClickStatus.STOPPED
    if (activityEndTime) {
      historyEntry.close(getRelativeTime(activityEndTime))
    } else {
      historyEntry.remove()
    }
    eventCountsSubscription.stop()
    stopObservable.notify()
  }

  return {
    event: startEvent,
    stop,
    stopObservable,

    get hasError() {
      return eventCountsSubscription.eventCounts.errorCount > 0
    },
    get hasPageActivity() {
      return activityEndTime !== undefined
    },
    getUserActivity,
    addFrustration: (frustrationType: FrustrationType) => {
      frustrationTypes.push(frustrationType)
    },
    startClocks,

    isStopped: () => status === ClickStatus.STOPPED || status === ClickStatus.FINALIZED,

    clone: () => newClick(lifeCycle, history, getUserActivity, clickActionBase, startEvent),

    validate: (domEvents?: Event[]) => {
      stop()
      if (status !== ClickStatus.STOPPED) {
        return
      }

      const { resourceCount, errorCount, longTaskCount } = eventCountsSubscription.eventCounts
      const clickAction: ClickAction = assign(
        {
          type: ActionType.CLICK as const,
          duration: activityEndTime && elapsed(startClocks.timeStamp, activityEndTime),
          startClocks,
          id,
          frustrationTypes,
          counts: {
            resourceCount,
            errorCount,
            longTaskCount,
          },
          events: domEvents ?? [startEvent],
          event: startEvent,
        },
        clickActionBase
      )
      lifeCycle.notify(LifeCycleEventType.AUTO_ACTION_COMPLETED, clickAction)
      status = ClickStatus.FINALIZED
    },

    discard: () => {
      stop()
      status = ClickStatus.FINALIZED
    },
  }
}

export function finalizeClicks(clicks: Click[], rageClick: Click) {
  const { isRage } = computeFrustration(clicks, rageClick)
  if (isRage) {
    clicks.forEach((click) => click.discard())
    rageClick.stop(timeStampNow())
    rageClick.validate(clicks.map((click) => click.event))
  } else {
    rageClick.discard()
    clicks.forEach((click) => click.validate())
  }
}
