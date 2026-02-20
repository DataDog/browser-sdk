import type { Duration, ClocksState, TimeStamp } from '@datadog/browser-core'
import { timeStampNow, Observable, timeStampToClocks, relativeToClocks, generateUUID } from '@datadog/browser-core'
import { isNodeShadowHost } from '../../browser/htmlDomUtils'
import type { FrustrationType } from '../../rawRumEvent.types'
import { ActionType } from '../../rawRumEvent.types'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { PAGE_ACTIVITY_VALIDATION_DELAY, waitPageActivityEnd } from '../waitPageActivityEnd'
import { getSelectorFromElement } from '../getSelectorFromElement'
import { getNodePrivacyLevel } from '../privacy'
import { NodePrivacyLevel } from '../privacyConstants'
import type { RumConfiguration } from '../configuration'
import type { RumMutationRecord } from '../../browser/domMutationObservable'
import { startEventTracker } from '../eventTracker'
import type { StoppedEvent, DiscardedEvent, EventTracker } from '../eventTracker'
import type { ClickChain } from './clickChain'
import { createClickChain } from './clickChain'
import { getActionNameFromElement } from './getActionNameFromElement'
import type { ActionNameSource } from './actionNameConstants'
import type { MouseEventOnElement, UserActivity } from './listenActionEvents'
import { listenActionEvents } from './listenActionEvents'
import { computeFrustration } from './computeFrustration'
import { CLICK_ACTION_MAX_DURATION, updateInteractionSelector } from './interactionSelectorCache'
import { isActionChildEvent } from './isActionChildEvent'

interface ActionCounts {
  errorCount: number
  longTaskCount: number
  resourceCount: number
}

export interface ClickAction {
  type: typeof ActionType.CLICK
  id: string
  name: string
  nameSource: ActionNameSource
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

export function trackClickActions(
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<RumMutationRecord[]>,
  windowOpenObservable: Observable<void>,
  configuration: RumConfiguration
) {
  const actionTracker = startEventTracker<ClickActionBase>(lifeCycle)
  const stopObservable = new Observable<void>()
  let currentClickChain: ClickChain | undefined

  lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, stopClickChain)
  lifeCycle.subscribe(LifeCycleEventType.PAGE_MAY_EXIT, stopClickChain)

  const { stop: stopActionEventsListener } = listenActionEvents<{
    clickActionBase: ClickActionBase
    hadActivityOnPointerDown: () => boolean
  }>(configuration, {
    onPointerDown: (pointerDownEvent) =>
      processPointerDown(configuration, lifeCycle, domMutationObservable, pointerDownEvent, windowOpenObservable),
    onPointerUp: ({ clickActionBase, hadActivityOnPointerDown }, startEvent, getUserActivity) => {
      startClickAction(
        configuration,
        lifeCycle,
        domMutationObservable,
        windowOpenObservable,
        actionTracker,
        stopObservable,
        appendClickToClickChain,
        clickActionBase,
        startEvent,
        getUserActivity,
        hadActivityOnPointerDown
      )
    },
  })

  return {
    stop: () => {
      stopClickChain()
      stopObservable.notify()
      stopActionEventsListener()
      actionTracker.stopAll()
    },
    findActionId: actionTracker.findId,
  }

  function appendClickToClickChain(click: Click) {
    if (!currentClickChain || !currentClickChain.tryAppend(click)) {
      const rageClick = click.clone()
      currentClickChain = createClickChain(click, (clicks) => {
        finalizeClicks(clicks, rageClick)
        // Clear the reference to allow garbage collection. Without this, the finalize callback
        // retains a closure reference to the old click chain, preventing it from being cleaned up
        // and causing a memory leak as click chains accumulate over time.
        currentClickChain = undefined
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
  domMutationObservable: Observable<RumMutationRecord[]>,
  pointerDownEvent: MouseEventOnElement,
  windowOpenObservable: Observable<void>
) {
  const targetForPrivacy = configuration.betaTrackActionsInShadowDom
    ? getEventTarget(pointerDownEvent)
    : pointerDownEvent.target

  let nodePrivacyLevel: NodePrivacyLevel

  if (configuration.enablePrivacyForActionName) {
    nodePrivacyLevel = getNodePrivacyLevel(targetForPrivacy, configuration.defaultPrivacyLevel)
  } else {
    nodePrivacyLevel = NodePrivacyLevel.ALLOW
  }

  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    return undefined
  }

  const clickActionBase = computeClickActionBase(pointerDownEvent, nodePrivacyLevel, configuration)

  let hadActivityOnPointerDown = false

  waitPageActivityEnd(
    lifeCycle,
    domMutationObservable,
    windowOpenObservable,
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
  domMutationObservable: Observable<RumMutationRecord[]>,
  windowOpenObservable: Observable<void>,
  actionTracker: EventTracker<ClickActionBase>,
  stopObservable: Observable<void>,
  appendClickToClickChain: (click: Click) => void,
  clickActionBase: ClickActionBase,
  startEvent: MouseEventOnElement,
  getUserActivity: () => UserActivity,
  hadActivityOnPointerDown: () => boolean
) {
  const click = newClick(lifeCycle, actionTracker, getUserActivity, clickActionBase, startEvent)
  appendClickToClickChain(click)

  const selector = clickActionBase?.target?.selector
  if (selector) {
    updateInteractionSelector(startEvent.timeStamp, selector)
  }

  const { stop: stopWaitPageActivityEnd } = waitPageActivityEnd(
    lifeCycle,
    domMutationObservable,
    windowOpenObservable,
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

  const pageMayExitSubscription = lifeCycle.subscribe(LifeCycleEventType.PAGE_MAY_EXIT, () => {
    click.stop(timeStampNow())
  })

  const stopSubscription = stopObservable.subscribe(() => {
    click.stop()
  })

  click.stopObservable.subscribe(() => {
    pageMayExitSubscription.unsubscribe()
    viewEndedSubscription.unsubscribe()
    stopWaitPageActivityEnd()
    stopSubscription.unsubscribe()
  })
}

export type ClickActionBase = Pick<ClickAction, 'type' | 'name' | 'nameSource' | 'target' | 'position'>

function computeClickActionBase(
  event: MouseEventOnElement,
  nodePrivacyLevel: NodePrivacyLevel,
  configuration: RumConfiguration
): ClickActionBase {
  const target = configuration.betaTrackActionsInShadowDom ? getEventTarget(event) : event.target

  const rect = target.getBoundingClientRect()
  const selector = getSelectorFromElement(target, configuration.actionNameAttribute)

  if (selector) {
    updateInteractionSelector(event.timeStamp, selector)
  }

  const { name, nameSource } = getActionNameFromElement(target, configuration, nodePrivacyLevel)

  return {
    type: ActionType.CLICK,
    target: {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      selector,
    },
    position: {
      // Use clientX and Y because for SVG element offsetX and Y are relatives to the <svg> element
      x: Math.round(event.clientX - rect.left),
      y: Math.round(event.clientY - rect.top),
    },
    name,
    nameSource,
  }
}

function getEventTarget(event: MouseEventOnElement): Element {
  if (event.composed && isNodeShadowHost(event.target) && typeof event.composedPath === 'function') {
    const composedPath = event.composedPath()
    if (composedPath.length > 0 && composedPath[0] instanceof Element) {
      return composedPath[0]
    }
  }
  return event.target
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
  actionTracker: EventTracker<ClickActionBase>,
  getUserActivity: () => UserActivity,
  clickActionBase: ClickActionBase,
  startEvent: MouseEventOnElement
) {
  const clickKey = generateUUID()
  const startClocks = relativeToClocks(startEvent.timeStamp)

  actionTracker.start(clickKey, startClocks, clickActionBase, { isChildEvent: isActionChildEvent })

  let status = ClickStatus.ONGOING
  let actionTrackerFinishedEvent: StoppedEvent<ClickActionBase> | DiscardedEvent<ClickActionBase> | undefined
  const frustrationTypes: FrustrationType[] = []
  const stopObservable = new Observable<void>()

  function stop(activityEndTime?: TimeStamp) {
    if (status !== ClickStatus.ONGOING) {
      return
    }

    status = ClickStatus.STOPPED

    actionTrackerFinishedEvent = activityEndTime
      ? actionTracker.stop(clickKey, timeStampToClocks(activityEndTime))
      : actionTracker.discard(clickKey)

    stopObservable.notify()
  }

  return {
    event: startEvent,
    stop,
    stopObservable,

    get hasError() {
      const currentCounts = actionTrackerFinishedEvent?.counts ?? actionTracker.getCounts(clickKey)
      return currentCounts ? currentCounts.errorCount > 0 : false
    },
    get hasPageActivity() {
      return actionTrackerFinishedEvent && 'duration' in actionTrackerFinishedEvent
    },
    getUserActivity,
    addFrustration: (frustrationType: FrustrationType) => {
      frustrationTypes.push(frustrationType)
    },
    get startClocks() {
      return startClocks
    },

    isStopped: () => status === ClickStatus.STOPPED || status === ClickStatus.FINALIZED,

    clone: () => newClick(lifeCycle, actionTracker, getUserActivity, clickActionBase, startEvent),

    validate: (domEvents?: Event[]) => {
      stop()
      if (status !== ClickStatus.STOPPED) {
        return
      }

      if (!actionTrackerFinishedEvent) {
        return
      }

      const clickAction: ClickAction = {
        frustrationTypes,
        events: domEvents ?? [startEvent],
        event: startEvent,
        ...actionTrackerFinishedEvent,
        counts: actionTrackerFinishedEvent.counts!, // This is needed to satisfy the type checker
      }

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
