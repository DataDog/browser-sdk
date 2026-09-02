import type { TimeoutId } from '@datadog/browser-core'
import { ONE_SECOND } from '@datadog/js-core/time'
import { clearTimeout, setTimeout } from '@datadog/browser-core'
import type { Click } from './trackClickActions'
import { FrustrationIgnore, shouldIgnore } from './frustrationIgnore'

export interface ClickChain {
  tryAppend: (click: Click) => boolean
  stop: () => void
}

export const MAX_DURATION_BETWEEN_CLICKS = ONE_SECOND
export const MAX_DISTANCE_BETWEEN_CLICKS = 100

const enum ClickChainStatus {
  WaitingForMoreClicks,
  WaitingForClicksToStop,
  Finalized,
}

export function createClickChain(firstClick: Click, onFinalize: (clicks: Click[]) => void): ClickChain {
  const bufferedClicks: Click[] = []
  let status = ClickChainStatus.WaitingForMoreClicks
  let maxDurationBetweenClicksTimeoutId: TimeoutId | undefined
  appendClick(firstClick)

  function appendClick(click: Click) {
    click.stopObservable.subscribe(tryFinalize)
    bufferedClicks.push(click)
    clearTimeout(maxDurationBetweenClicksTimeoutId)
    maxDurationBetweenClicksTimeoutId = setTimeout(dontAcceptMoreClick, MAX_DURATION_BETWEEN_CLICKS)
  }

  function tryFinalize() {
    if (status === ClickChainStatus.WaitingForClicksToStop && bufferedClicks.every((click) => click.isStopped())) {
      status = ClickChainStatus.Finalized
      onFinalize(bufferedClicks)
    }
  }

  function dontAcceptMoreClick() {
    clearTimeout(maxDurationBetweenClicksTimeoutId)
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

      if (bufferedClicks.length > 0 && !areClicksSimilar(bufferedClicks[bufferedClicks.length - 1], click)) {
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
 * Checks whether two clicks are similar by comparing their rage ignore state, target, position and timestamp
 */
function areClicksSimilar(first: Click, second: Click) {
  return (
    shouldIgnore(first.ignore, FrustrationIgnore.RAGE_CLICK) ===
      shouldIgnore(second.ignore, FrustrationIgnore.RAGE_CLICK) &&
    first.event.target === second.event.target &&
    mouseEventDistance(first.event, second.event) <= MAX_DISTANCE_BETWEEN_CLICKS &&
    first.event.timeStamp - second.event.timeStamp <= MAX_DURATION_BETWEEN_CLICKS
  )
}

function mouseEventDistance(origin: MouseEvent, other: MouseEvent) {
  return Math.sqrt(Math.pow(origin.clientX - other.clientX, 2) + Math.pow(origin.clientY - other.clientY, 2))
}
