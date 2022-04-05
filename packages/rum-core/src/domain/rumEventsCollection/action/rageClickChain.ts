import { monitor, ONE_SECOND, timeStampNow } from '@datadog/browser-core'
import { FrustrationType } from '../../../rawRumEvent.types'
import type { PotentialAction } from './trackClickActions'

export interface RageClickChain {
  tryAppend: (clickAction: PotentialAction) => boolean
  stop: () => void
}

export const MAX_DURATION_BETWEEN_CLICKS = ONE_SECOND
export const MAX_DISTANCE_BETWEEN_CLICKS = 100

const enum RageClickChainStatus {
  WaitingForMoreClickActions,
  WaitingForClickActionsToStop,
  Flushed,
}

export function createRageClickChain(firstClickAction: PotentialAction): RageClickChain {
  const bufferedClickActions: PotentialAction[] = []
  let stoppedClickActionsCount = 0
  let status = RageClickChainStatus.WaitingForMoreClickActions
  let timeout: number | undefined
  const rageClickAction = firstClickAction.clone()

  function dontAcceptMoreClickAction() {
    if (status === RageClickChainStatus.WaitingForMoreClickActions) {
      status = RageClickChainStatus.WaitingForClickActionsToStop
      tryFlush()
    }
  }

  function tryFlush() {
    if (
      status === RageClickChainStatus.WaitingForClickActionsToStop &&
      stoppedClickActionsCount === bufferedClickActions.length
    ) {
      status = RageClickChainStatus.Flushed
      flushClickActions(bufferedClickActions, rageClickAction)
    }
  }

  function appendClickAction(clickAction: PotentialAction) {
    clickAction.onStop(() => {
      stoppedClickActionsCount += 1
      tryFlush()
    })
    bufferedClickActions.push(clickAction)
    timeout = setTimeout(monitor(dontAcceptMoreClickAction), MAX_DURATION_BETWEEN_CLICKS)
  }

  appendClickAction(firstClickAction)
  return {
    tryAppend: (clickAction) => {
      clearTimeout(timeout)

      if (status !== RageClickChainStatus.WaitingForMoreClickActions) {
        return false
      }

      if (
        bufferedClickActions.length > 0 &&
        !areEventsSimilar(bufferedClickActions[bufferedClickActions.length - 1].base.event, clickAction.base.event)
      ) {
        dontAcceptMoreClickAction()
        return false
      }

      appendClickAction(clickAction)
      return true
    },
    stop: () => {
      clearTimeout(timeout)
      dontAcceptMoreClickAction()
    },
  }
}

/**
 * Checks whether two events are similar by comparing their target, position and timestamp
 */
function areEventsSimilar(first: MouseEvent, second: MouseEvent) {
  return (
    first.target === second.target &&
    // Similar position
    mouseEventDistance(first, second) <= MAX_DISTANCE_BETWEEN_CLICKS &&
    // Similar time
    first.timeStamp - second.timeStamp <= MAX_DURATION_BETWEEN_CLICKS
  )
}

function mouseEventDistance(origin: MouseEvent, other: MouseEvent) {
  return Math.sqrt(Math.pow(origin.clientX - other.clientX, 2) + Math.pow(origin.clientY - other.clientY, 2))
}

function flushClickActions(clickActions: PotentialAction[], rageClickAction: PotentialAction) {
  if (isRage(clickActions)) {
    // If it should be be considered as a rage click, discard individual click actions and validate
    // the rage click action.
    clickActions.forEach((action) => action.discard())

    clickActions.forEach((action) => {
      action.getFrustrations().forEach((frustration) => {
        rageClickAction.addFrustration(frustration)
      })
    })
    rageClickAction.addFrustration(FrustrationType.RAGE)
    rageClickAction.validate(timeStampNow())
  } else {
    // Otherwise, discard the rage click action and validate the individual click actions
    rageClickAction.discard()
    clickActions.forEach((action) => action.validate())
  }
}

// Minimum number of click per second to consider a chain click as "rage"
const RAGE_CLICK_THRESHOLD = 3
export function isRage(clickActions: PotentialAction[]) {
  // TODO: this condition should be improved to avoid reporting 3-click selection as rage click
  for (let i = 0; i < clickActions.length - (RAGE_CLICK_THRESHOLD - 1); i += 1) {
    if (
      clickActions[i + RAGE_CLICK_THRESHOLD - 1].base.event.timeStamp - clickActions[i].base.event.timeStamp <=
      ONE_SECOND
    ) {
      return true
    }
  }
  return false
}
