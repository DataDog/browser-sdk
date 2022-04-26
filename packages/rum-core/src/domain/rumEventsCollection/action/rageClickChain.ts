import { monitor, ONE_SECOND, timeStampNow } from '@datadog/browser-core'
import { FrustrationType } from '../../../rawRumEvent.types'
import type { PotentialClickAction } from './trackClickActions'

export interface RageClickChain {
  tryAppend: (potentialClickAction: PotentialClickAction) => boolean
  stop: () => void
}

export const MAX_DURATION_BETWEEN_CLICKS = ONE_SECOND
export const MAX_DISTANCE_BETWEEN_CLICKS = 100

const enum RageClickChainStatus {
  WaitingForMorePotentialClickActions,
  WaitingForPotentialClickActionsToStop,
  Flushed,
}

export function createRageClickChain(firstPotentialClickAction: PotentialClickAction): RageClickChain {
  const bufferedPotentialClickActions: PotentialClickAction[] = []
  let stoppedPotentialClickActionsCount = 0
  let status = RageClickChainStatus.WaitingForMorePotentialClickActions
  let timeout: number | undefined
  const potentialRageClickAction = firstPotentialClickAction.clone()

  function dontAcceptMorePotentialClickAction() {
    if (status === RageClickChainStatus.WaitingForMorePotentialClickActions) {
      status = RageClickChainStatus.WaitingForPotentialClickActionsToStop
      tryFlush()
    }
  }

  function tryFlush() {
    if (
      status === RageClickChainStatus.WaitingForPotentialClickActionsToStop &&
      stoppedPotentialClickActionsCount === bufferedPotentialClickActions.length
    ) {
      status = RageClickChainStatus.Flushed
      flushPotentialClickActions(bufferedPotentialClickActions, potentialRageClickAction)
    }
  }

  function appendPotentialClickAction(potentialClickAction: PotentialClickAction) {
    potentialClickAction.onStop(() => {
      stoppedPotentialClickActionsCount += 1
      tryFlush()
    })
    bufferedPotentialClickActions.push(potentialClickAction)
    timeout = setTimeout(monitor(dontAcceptMorePotentialClickAction), MAX_DURATION_BETWEEN_CLICKS)
  }

  appendPotentialClickAction(firstPotentialClickAction)
  return {
    tryAppend: (potentialClickAction) => {
      clearTimeout(timeout)

      if (status !== RageClickChainStatus.WaitingForMorePotentialClickActions) {
        return false
      }

      if (
        bufferedPotentialClickActions.length > 0 &&
        !areEventsSimilar(
          bufferedPotentialClickActions[bufferedPotentialClickActions.length - 1].base.event,
          potentialClickAction.base.event
        )
      ) {
        dontAcceptMorePotentialClickAction()
        return false
      }

      appendPotentialClickAction(potentialClickAction)
      return true
    },
    stop: () => {
      clearTimeout(timeout)
      dontAcceptMorePotentialClickAction()
    },
  }
}

/**
 * Checks whether two events are similar by comparing their target, position and timestamp
 */
function areEventsSimilar(first: MouseEvent, second: MouseEvent) {
  return (
    first.target === second.target &&
    mouseEventDistance(first, second) <= MAX_DISTANCE_BETWEEN_CLICKS &&
    first.timeStamp - second.timeStamp <= MAX_DURATION_BETWEEN_CLICKS
  )
}

function mouseEventDistance(origin: MouseEvent, other: MouseEvent) {
  return Math.sqrt(Math.pow(origin.clientX - other.clientX, 2) + Math.pow(origin.clientY - other.clientY, 2))
}

function flushPotentialClickActions(
  potentialClickActions: PotentialClickAction[],
  potentialRageClickAction: PotentialClickAction
) {
  if (isRage(potentialClickActions)) {
    // If it should be be considered as a rage click, discard individual potential click actions and
    // validate the potential rage click action.
    potentialClickActions.forEach((potentialClickAction) => potentialClickAction.discard())

    potentialClickActions.forEach((potentialClickAction) => {
      potentialClickAction.getFrustrations().forEach((frustration) => {
        potentialRageClickAction.addFrustration(frustration)
      })
    })
    potentialRageClickAction.addFrustration(FrustrationType.RAGE)
    potentialRageClickAction.validate(timeStampNow())
  } else {
    // Otherwise, discard the potential rage click action and validate the individual potential
    // click actions
    potentialRageClickAction.discard()
    potentialClickActions.forEach((potentialClickAction) => potentialClickAction.validate())
  }
}

const MIN_CLICKS_PER_SECOND_TO_CONSIDER_RAGE = 3

export function isRage(potentialClickActions: PotentialClickAction[]) {
  // TODO: this condition should be improved to avoid reporting 3-click selection as rage click
  for (let i = 0; i < potentialClickActions.length - (MIN_CLICKS_PER_SECOND_TO_CONSIDER_RAGE - 1); i += 1) {
    if (
      potentialClickActions[i + MIN_CLICKS_PER_SECOND_TO_CONSIDER_RAGE - 1].base.event.timeStamp -
        potentialClickActions[i].base.event.timeStamp <=
      ONE_SECOND
    ) {
      return true
    }
  }
  return false
}
