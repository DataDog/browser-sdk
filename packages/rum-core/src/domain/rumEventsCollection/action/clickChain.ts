import { monitor, ONE_SECOND, timeStampNow } from '@datadog/browser-core'
import { FrustrationType } from '../../../rawRumEvent.types'
import type { Click } from './trackClickActions'

export interface ClickChain {
  tryAppend: (click: Click) => boolean
  setSelectionChanged: () => void
  stop: () => void
}

export const MAX_DURATION_BETWEEN_CLICKS = ONE_SECOND
export const MAX_DISTANCE_BETWEEN_CLICKS = 100

const enum ClickChainStatus {
  WaitingForMoreClicks,
  WaitingForClicksToStop,
  Finalized,
}

export function createClickChain(firstClick: Click): ClickChain {
  const bufferedClicks: Click[] = []
  let status = ClickChainStatus.WaitingForMoreClicks
  let maxDurationBetweenClicksTimeout: number | undefined
  let selectionChanged = false
  const rageClick = firstClick.clone()
  appendClick(firstClick)

  function appendClick(click: Click) {
    click.stopObservable.subscribe(tryFinalize)
    bufferedClicks.push(click)
    clearTimeout(maxDurationBetweenClicksTimeout)
    maxDurationBetweenClicksTimeout = setTimeout(monitor(dontAcceptMoreClick), MAX_DURATION_BETWEEN_CLICKS)
  }

  function tryFinalize() {
    if (status === ClickChainStatus.WaitingForClicksToStop && bufferedClicks.every((click) => click.isStopped())) {
      status = ClickChainStatus.Finalized
      finalizeClicks(bufferedClicks, rageClick, selectionChanged)
    }
  }

  function dontAcceptMoreClick() {
    clearTimeout(maxDurationBetweenClicksTimeout)
    if (status === ClickChainStatus.WaitingForMoreClicks) {
      status = ClickChainStatus.WaitingForClicksToStop
      tryFinalize()
    }
  }

  return {
    tryAppend: (click) => {
      if (status !== ClickChainStatus.WaitingForMoreClicks) {
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
    setSelectionChanged: () => {
      selectionChanged = true
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

function finalizeClicks(clicks: Click[], rageClick: Click, selectionChanged: boolean) {
  if (!selectionChanged && isRage(clicks)) {
    clicks.forEach((click) => {
      click.discard()
      if (click.isPotentiallyDead()) {
        rageClick.setPotentiallyDead()
      }
    })
    rageClick.addFrustration(FrustrationType.RAGE_CLICK)
    rageClick.validate(timeStampNow(), selectionChanged)
  } else {
    rageClick.discard()
    clicks.forEach((click) => click.validate(undefined, selectionChanged))
  }
}

const MIN_CLICKS_PER_SECOND_TO_CONSIDER_RAGE = 3

export function isRage(clicks: Click[]) {
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
