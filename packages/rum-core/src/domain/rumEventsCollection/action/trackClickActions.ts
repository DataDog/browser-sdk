import type { Duration, ClocksState, RelativeTime, TimeStamp } from '@datadog/browser-core'
import {
  timeStampNow,
  isExperimentalFeatureEnabled,
  Observable,
  assign,
  getRelativeTime,
  ONE_MINUTE,
  ContextHistory,
  generateUUID,
  clocksNow,
  ONE_SECOND,
  elapsed,
} from '@datadog/browser-core'
import type { FrustrationType } from '../../../rawRumEvent.types'
import { ActionType } from '../../../rawRumEvent.types'
import type { RumConfiguration } from '../../configuration'
import type { LifeCycle } from '../../lifeCycle'
import { LifeCycleEventType } from '../../lifeCycle'
import { trackEventCounts } from '../../trackEventCounts'
import { waitPageActivityEnd } from '../../waitPageActivityEnd'
import type { ClickChain } from './clickChain'
import { createClickChain } from './clickChain'
import { getActionNameFromElement } from './getActionNameFromElement'
import { getSelectorsFromElement } from './getSelectorsFromElement'
import type { OnClickContext } from './listenActionEvents'
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
    selector: string
    selector_with_stable_attributes?: string
    width: number
    height: number
  }
  position?: { x: number; y: number }
  startClocks: ClocksState
  duration?: Duration
  counts: ActionCounts
  event: MouseEvent & { target: Element }
  frustrationTypes: FrustrationType[]
  events: Event[]
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
  configuration: RumConfiguration
) {
  const history: ClickActionIdHistory = new ContextHistory(ACTION_CONTEXT_TIME_OUT_DELAY)
  const stopObservable = new Observable<void>()
  const { trackFrustrations } = configuration
  let currentClickChain: ClickChain | undefined

  lifeCycle.subscribe(LifeCycleEventType.SESSION_RENEWED, () => {
    history.reset()
  })

  lifeCycle.subscribe(LifeCycleEventType.BEFORE_UNLOAD, stopClickChain)
  lifeCycle.subscribe(LifeCycleEventType.VIEW_ENDED, stopClickChain)

  const { stop: stopActionEventsListener } = listenActionEvents({ onClick: processClick })

  const actionContexts: ActionContexts = {
    findActionId: (startTime?: RelativeTime) =>
      trackFrustrations ? history.findAll(startTime) : history.find(startTime),
  }

  return {
    stop: () => {
      stopClickChain()
      stopObservable.notify()
      stopActionEventsListener()
    },
    actionContexts,
  }

  function stopClickChain() {
    if (currentClickChain) {
      currentClickChain.stop()
    }
  }

  function processClick({ event, getUserActivity }: OnClickContext) {
    if (!trackFrustrations && history.find()) {
      // TODO: remove this in a future major version. To keep retrocompatibility, ignore any new
      // action if another one is already occurring.
      return
    }

    const clickActionBase = computeClickActionBase(event, configuration.actionNameAttribute)
    if (!trackFrustrations && !clickActionBase.name) {
      // TODO: remove this in a future major version. To keep retrocompatibility, ignore any action
      // with a blank name
      return
    }

    const click = newClick(lifeCycle, history, getUserActivity, clickActionBase)

    if (trackFrustrations && (!currentClickChain || !currentClickChain.tryAppend(click))) {
      const rageClick = click.clone()
      currentClickChain = createClickChain(click, (clicks) => {
        finalizeClicks(clicks, rageClick)
      })
    }

    const { stop: stopWaitPageActivityEnd } = waitPageActivityEnd(
      lifeCycle,
      domMutationObservable,
      configuration,
      (pageActivityEndEvent) => {
        if (pageActivityEndEvent.hadActivity && pageActivityEndEvent.end < clickActionBase.startClocks.timeStamp) {
          // If the clock is looking weird, just discard the click
          click.discard()
        } else {
          click.stop(pageActivityEndEvent.hadActivity ? pageActivityEndEvent.end : undefined)

          // Validate or discard the click only if we don't track frustrations. It'll be done when
          // the click chain is finalized.
          if (!trackFrustrations) {
            if (!pageActivityEndEvent.hadActivity) {
              // If we are not tracking frustrations, we should discard the click to keep backward
              // compatibility.
              click.discard()
            } else {
              click.validate()
            }
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
}

function computeClickActionBase(event: MouseEvent & { target: Element }, actionNameAttribute?: string) {
  let target: ClickAction['target']
  let position: ClickAction['position']

  if (isExperimentalFeatureEnabled('clickmap')) {
    const rect = event.target.getBoundingClientRect()
    target = assign(
      {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      getSelectorsFromElement(event.target, actionNameAttribute)
    )
    position = {
      // Use clientX and Y because for SVG element offsetX and Y are relatives to the <svg> element
      x: Math.round(event.clientX - rect.left),
      y: Math.round(event.clientY - rect.top),
    }
  }

  return {
    type: 'click',
    target,
    position,
    name: getActionNameFromElement(event.target, actionNameAttribute),
    event,
    startClocks: clocksNow(),
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
  getUserActivity: OnClickContext['getUserActivity'],
  clickActionBase: Pick<ClickAction, 'startClocks' | 'event' | 'name' | 'target' | 'position'>
) {
  const id = generateUUID()
  const historyEntry = history.add(id, clickActionBase.startClocks.relative)
  const eventCountsSubscription = trackEventCounts(lifeCycle)
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
    event: clickActionBase.event,
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

    isStopped: () => status === ClickStatus.STOPPED || status === ClickStatus.FINALIZED,

    clone: () => newClick(lifeCycle, history, getUserActivity, clickActionBase),

    validate: (domEvents?: Event[]) => {
      stop()
      if (status !== ClickStatus.STOPPED) {
        return
      }

      const { resourceCount, errorCount, longTaskCount } = eventCountsSubscription.eventCounts
      const clickAction: ClickAction = assign(
        {
          type: ActionType.CLICK as const,
          duration: activityEndTime && elapsed(clickActionBase.startClocks.timeStamp, activityEndTime),
          id,
          frustrationTypes,
          counts: {
            resourceCount,
            errorCount,
            longTaskCount,
          },
          events: domEvents ?? [clickActionBase.event],
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
