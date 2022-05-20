import { monitor, ONE_SECOND, timeStampNow } from '@datadog/browser-core'
import { FrustrationType } from '../../../rawRumEvent.types'
import type { Click } from './trackClickActions'

export interface RageClickChain {
  tryAppend: (click: Click) => boolean
  stop: () => void
}

export const MAX_DURATION_BETWEEN_CLICKS = ONE_SECOND
export const MAX_DISTANCE_BETWEEN_CLICKS = 100

const enum RageClickChainStatus {
  WaitingForMoreClicks,
  WaitingForClicksToStop,
  Finalized,
}

export function createRageClickChain(firstClick: Click): RageClickChain {
  const bufferedClicks: Click[] = []
  let status = RageClickChainStatus.WaitingForMoreClicks
  let maxDurationBetweenClicksTimeout: number | undefined
  const rageClick = firstClick.clone()
  appendClick(firstClick)

  function appendClick(click: Click) {
    click.stopObservable.subscribe(tryFinalize)
    bufferedClicks.push(click)
    clearTimeout(maxDurationBetweenClicksTimeout)
    maxDurationBetweenClicksTimeout = setTimeout(monitor(dontAcceptMoreClick), MAX_DURATION_BETWEEN_CLICKS)
  }

  function tryFinalize() {
    if (status === RageClickChainStatus.WaitingForClicksToStop && bufferedClicks.every((click) => click.isStopped())) {
      status = RageClickChainStatus.Finalized
      finalizeClicks(bufferedClicks, rageClick)
    }
  }

  function dontAcceptMoreClick() {
    clearTimeout(maxDurationBetweenClicksTimeout)
    if (status === RageClickChainStatus.WaitingForMoreClicks) {
      status = RageClickChainStatus.WaitingForClicksToStop
      tryFinalize()
    }
  }

  return {
    tryAppend: (click) => {
      if (status !== RageClickChainStatus.WaitingForMoreClicks) {
        return false
      }

      if (
        bufferedClicks.length > 0 &&
        !areEventsSimilar(bufferedClicks[bufferedClicks.length - 1].event, click.event)
      ) {
        dontAcceptMoreClick()
        return false
      }

      appendClick(click)
      return true
    },
    stop: () => {
      dontAcceptMoreClick()
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

function finalizeClicks(clicks: Click[], rageClick: Click) {
  if (isRage(clicks)) {
    clicks.forEach((click) => {
      click.discard()
      click.getFrustrations().forEach((frustration) => {
        rageClick.addFrustration(frustration)
      })
    })
    rageClick.addFrustration(FrustrationType.RAGE_CLICK)
    rageClick.validate(timeStampNow())
  } else {
    rageClick.discard()
    clicks.forEach((click) => click.validate())
  }
}

const MIN_CLICKS_PER_SECOND_TO_CONSIDER_RAGE = 3

export function isRage(clicks: Click[]) {
  // TODO: this condition should be improved to avoid reporting 3-click selection as rage click
  for (let i = 0; i < clicks.length - (MIN_CLICKS_PER_SECOND_TO_CONSIDER_RAGE - 1); i += 1) {
    if (
      clicks[i + MIN_CLICKS_PER_SECOND_TO_CONSIDER_RAGE - 1].event.timeStamp - clicks[i].event.timeStamp <=
      ONE_SECOND
    ) {
      return true
    }
  }
  return false
}
