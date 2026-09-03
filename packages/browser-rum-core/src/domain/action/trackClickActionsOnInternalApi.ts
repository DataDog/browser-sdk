// PoC (phase 3b of the internal API plan, see /plan.md): trackClickActions ported to the RUM
// internal API, used by the phase 2 public API. Mirrors trackClickActions.ts (untouched, still
// used by the startRum pipeline), with these differences:
// * Each click is an internal API action event: `startEvent` with only the kickoff
//   (`action.type: 'click'`); the click start-time context (name, target, position, name source)
//   is kept by the caller and passed at `stop()` — no eventTracker-style side API, as decided in
//   the plan. `cancel()` discards clicks (removes the history entry, so discarded clicks no longer
//   link child events, as eventTracker discards do today).
// * ACTION_STARTED / AUTO_ACTION_COMPLETED lifecycle events are replaced by `notifications`:
//   `event_started` fires synchronously at startEvent, `event_collected` when the final version
//   is assembled.
// * The click chain and the frustration / rage-click computation (clickChain, computeFrustration)
//   are unchanged caller logic. `Click.hasError` reads the live child counts from
//   `handle.current()`: counts are solely owned and computed by the internal API, exposed on
//   the event's current state.
// * VIEW_ENDED / PREPARE_URGENT_FLUSH come from `notifications` (`event_stopped` for view
//   events) and the transport batch's `prepareUrgentFlushObservable`, instead of the LifeCycle.
//   Caveat: the view end is only notified once its final assembly runs, so under session
//   buffering, clicks stop on page activity end before the view end is visible.
// * The LifeCycle passed to waitPageActivityEnd is a private instance: request events
//   (REQUEST_STARTED / REQUEST_COMPLETED) never flow in this pipeline — a corner-cut of the
//   phase 2 public API (no auto-instrumentation); page activity relies on DOM mutations.

import { timeStampNow, timeStampToClocks, relativeToClocks, elapsed, toServerDuration } from '@datadog/js-core/time'
import type { ClocksState, TimeStamp } from '@datadog/js-core/time'
import { Observable } from '@datadog/browser-core'
import type { PageExitReason } from '@datadog/browser-core'
import { discardNegativeDuration } from '../discardNegativeDuration'
import { isNodeShadowHost } from '../../browser/htmlDomUtils'
import type { FrustrationType } from '../../rawRumEvent.types'
import { ActionType } from '../../rawRumEvent.types'
import type { RumConfiguration } from '../configuration'
import type { RumMutationRecord } from '../../browser/domMutationObservable'
import { LifeCycle } from '../lifeCycle'
import { PAGE_ACTIVITY_VALIDATION_DELAY, waitPageActivityEnd } from '../waitPageActivityEnd'
import { getSelectorFromElement } from '../getSelectorFromElement'
import { getNodePrivacyLevel } from '../privacy'
import { NodePrivacyLevel } from '../privacyConstants'
import { getComposedPathSelector } from '../getComposedPathSelector'
import type { RumInternalApi } from '../internalApi/rumInternalApi.types'
import type { ClickChain } from './clickChain'
import { createClickChain } from './clickChain'
import { getActionNameFromElement } from './getActionNameFromElement'
import type { ActionNameSource } from './actionNameConstants'
import type { MouseEventOnElement, UserActivity } from './listenActionEvents'
import { listenActionEvents } from './listenActionEvents'
import { computeFrustration } from './computeFrustration'
import { CLICK_ACTION_MAX_DURATION, updateInteractionSelector } from './interactionSelectorCache'

export interface ClickActionBase {
  type: typeof ActionType.CLICK
  name: string
  nameSource: ActionNameSource
  target?: {
    selector: string | undefined
    composedPathSelector?: string
    width: number
    height: number
  }
  position?: { x: number; y: number }
}

export function trackClickActionsOnInternalApi(
  internalApi: RumInternalApi,
  prepareUrgentFlushObservable: Observable<PageExitReason>,
  domMutationObservable: Observable<RumMutationRecord[]>,
  windowOpenObservable: Observable<void>,
  configuration: RumConfiguration
) {
  const stopObservable = new Observable<void>()
  let currentClickChain: ClickChain | undefined
  // The LifeCycle only serves waitPageActivityEnd's REQUEST_STARTED / REQUEST_COMPLETED
  // subscriptions, which never flow in this pipeline (see the notes at the top of this file).
  const metricsLifeCycle = new LifeCycle()

  const notificationsSubscription = internalApi.notifications.subscribe((notification) => {
    // The current view ended: stop the ongoing click chain, as the old VIEW_ENDED subscription
    if (notification.type === 'event_stopped' && notification.event.type === 'view') {
      stopClickChain()
    }
  })

  // Page unloading: stop the ongoing click chain (and the clicks, in startClickAction)
  const urgentFlushSubscription = prepareUrgentFlushObservable.subscribe(() => stopClickChain())

  const { stop: stopActionEventsListener } = listenActionEvents<{
    clickActionBase: ClickActionBase | undefined
    hadActivityOnPointerDown: () => boolean
  }>({
    onPointerDown: (pointerDownEvent) =>
      processPointerDown(
        configuration,
        metricsLifeCycle,
        domMutationObservable,
        pointerDownEvent,
        windowOpenObservable
      ),
    onPointerUp: ({ clickActionBase, hadActivityOnPointerDown }, startEvent, getUserActivity) => {
      if (clickActionBase) {
        startClickAction(
          internalApi,
          prepareUrgentFlushObservable,
          configuration,
          metricsLifeCycle,
          domMutationObservable,
          windowOpenObservable,
          stopObservable,
          appendClickToClickChain,
          clickActionBase,
          startEvent,
          getUserActivity,
          hadActivityOnPointerDown
        )
      }
    },
  })

  return {
    stop: () => {
      stopClickChain()
      stopObservable.notify()
      stopActionEventsListener()
      notificationsSubscription.unsubscribe()
      urgentFlushSubscription.unsubscribe()
    },
  }

  function appendClickToClickChain(click: InternalApiClick) {
    if (!currentClickChain?.tryAppend(click)) {
      const rageClick = click.clone()
      // Cast: InternalApiClick is structurally compatible with the old Click (the click chain and
      // frustration computations are unchanged caller logic); the inferred getter types differ
      // slightly.
      currentClickChain = createClickChain(click, (clicks) => {
        finalizeClicks(clicks as unknown as InternalApiClick[], rageClick)
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
  let nodePrivacyLevel: NodePrivacyLevel

  if (configuration.enablePrivacyForActionName) {
    nodePrivacyLevel = getNodePrivacyLevel(getEventTarget(pointerDownEvent), configuration.defaultPrivacyLevel)
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
  internalApi: RumInternalApi,
  prepareUrgentFlushObservable: Observable<PageExitReason>,
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  domMutationObservable: Observable<RumMutationRecord[]>,
  windowOpenObservable: Observable<void>,
  stopObservable: Observable<void>,
  appendClickToClickChain: (click: InternalApiClick) => void,
  clickActionBase: ClickActionBase,
  startEvent: MouseEventOnElement,
  getUserActivity: () => UserActivity,
  hadActivityOnPointerDown: () => boolean
) {
  const click = newClick(internalApi, clickActionBase, startEvent, getUserActivity)
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

  // Page unloading: stop the click so its final version makes it to the batch (as the old
  // PREPARE_URGENT_FLUSH subscription)
  const pageMayExitSubscription = prepareUrgentFlushObservable.subscribe(() => {
    click.stop(timeStampNow())
  })

  const stopSubscription = stopObservable.subscribe(() => {
    click.stop()
  })

  click.stopObservable.subscribe(() => {
    stopWaitPageActivityEnd()
    pageMayExitSubscription.unsubscribe()
    stopSubscription.unsubscribe()
  })
}

const enum ClickStatus {
  // Initial state, the click is still ongoing.
  ONGOING,
  // The click is no more ongoing but still needs to be validated or discarded.
  STOPPED,
  // Final state, the click has been stopped and validated or discarded.
  FINALIZED,
}

export type InternalApiClick = ReturnType<typeof newClick>

function newClick(
  internalApi: RumInternalApi,
  clickActionBase: ClickActionBase,
  startEvent: MouseEventOnElement,
  getUserActivity: () => UserActivity
) {
  const startClocks = relativeToClocks(startEvent.timeStamp)
  // The kickoff only carries the action type: the click start-time context (name, target,
  // position, name source) is kept by the caller and passed at stop() — no eventTracker-style
  // side API (see /plan.md). The click is an action event with a start time (the interaction
  // timestamp), so child events are linked to it while it is ongoing.
  const handle = internalApi.startEvent(
    { type: 'action', action: { type: ActionType.CLICK } },
    { startClocks, domainContext: { events: [startEvent] } }
  )

  let status = ClickStatus.ONGOING
  let endClocks: ClocksState | undefined
  const frustrationTypes: FrustrationType[] = []
  const stopObservable = new Observable<void>()

  function stop(activityEndTime?: TimeStamp) {
    if (status !== ClickStatus.ONGOING) {
      return
    }

    status = ClickStatus.STOPPED

    if (activityEndTime !== undefined) {
      endClocks = timeStampToClocks(activityEndTime)
    } else {
      // No activity end time: the click is discarded. Cancelling removes the history entry, so
      // the discarded click no longer links child events, as eventTracker.discard does today.
      handle.cancel()
    }

    stopObservable.notify()
  }

  return {
    event: startEvent,
    stop,
    stopObservable,

    // Frustration computation reads this after child events were assembled: the live child
    // counts come from the handle's current state (counts are solely computed by the internal
    // API)
    get hasError() {
      return (handle.current().counts?.errorCount ?? 0) > 0
    },
    get hasPageActivity(): boolean {
      return status !== ClickStatus.ONGOING && endClocks !== undefined
    },
    getUserActivity,
    addFrustration: (frustrationType: FrustrationType) => {
      frustrationTypes.push(frustrationType)
    },
    get startClocks() {
      return startClocks
    },

    isStopped: () => status === ClickStatus.STOPPED || status === ClickStatus.FINALIZED,

    clone: () => newClick(internalApi, clickActionBase, startEvent, getUserActivity),

    validate: () => {
      stop()
      if (status !== ClickStatus.STOPPED) {
        return
      }

      if (!endClocks) {
        return
      }

      const loadingTime = discardNegativeDuration(toServerDuration(elapsed(startClocks.timeStamp, endClocks.timeStamp)))

      handle.stop(
        {
          action: {
            target: { name: clickActionBase.name },
            ...(loadingTime !== undefined && { loading_time: loadingTime }),
            frustration: { type: frustrationTypes },
          },
          _dd: {
            action: {
              target: {
                selector: clickActionBase.target?.selector || undefined,
                width: clickActionBase.target?.width || undefined,
                height: clickActionBase.target?.height || undefined,
                composed_path_selector: clickActionBase.target?.composedPathSelector,
              },
              position: clickActionBase.position,
              name_source: clickActionBase.nameSource,
            },
          },
        },
        { endClocks }
      )
      status = ClickStatus.FINALIZED
    },

    discard: () => {
      stop()
      status = ClickStatus.FINALIZED
    },
  }
}

export function finalizeClicks(clicks: InternalApiClick[], rageClick: InternalApiClick) {
  const { isRage } = computeFrustration(clicks, rageClick)
  if (isRage) {
    clicks.forEach((click) => click.discard())
    rageClick.stop(timeStampNow())
    rageClick.validate()
  } else {
    rageClick.discard()
    clicks.forEach((click) => click.validate())
  }
}

function computeClickActionBase(
  event: MouseEventOnElement,
  nodePrivacyLevel: NodePrivacyLevel,
  configuration: RumConfiguration
): ClickActionBase {
  const target = getEventTarget(event)

  const rect = target.getBoundingClientRect()
  const selector = getSelectorFromElement(target, configuration.actionNameAttribute)

  const composedPathSelector = getComposedPathSelector(event.composedPath(), configuration.actionNameAttribute)

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
      composedPathSelector: composedPathSelector || undefined,
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
