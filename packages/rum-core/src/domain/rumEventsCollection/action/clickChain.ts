import type { TimeStamp } from '@datadog/browser-core'
import { monitor, timeStampNow, ONE_SECOND } from '@datadog/browser-core'

export interface ClickChain<Click extends BaseClick> {
  tryAppend: (click: Click) => null | ClickReference
  stop: () => void
}

export interface ClickReference {
  markAsComplete: () => void
}

export interface BaseClick {
  event: MouseEvent
  timeStamp: TimeStamp
}

export const CLICK_CHAIN_WINDOW_SIZE = 3
export const CLICK_CHAIN_MAX_DURATION_WINDOW = ONE_SECOND
export const CLICK_CHAIN_MAX_DISTANCE_WINDOW = 100

const enum ClickChainStatus {
  WaitingForMoreClicks,
  WaitingForClicksToComplete,
  Flushed,
}

export function createClickChain<Click extends BaseClick>(onFlush: (clicks: Click[]) => void): ClickChain<Click> {
  const clicks: Click[] = []
  let completeClicksCount = 0
  let status = ClickChainStatus.WaitingForMoreClicks
  let timeout: number | undefined

  function dontAcceptMoreClick() {
    if (status === ClickChainStatus.WaitingForMoreClicks) {
      status = ClickChainStatus.WaitingForClicksToComplete
      tryFlush()
    }
  }

  function tryFlush() {
    if (status === ClickChainStatus.WaitingForClicksToComplete && completeClicksCount === clicks.length) {
      status = ClickChainStatus.Flushed
      onFlush(clicks)
    }
  }

  function getWindowStartClick() {
    return clicks[Math.max(0, clicks.length - CLICK_CHAIN_WINDOW_SIZE)]
  }

  return {
    tryAppend: (click) => {
      clearTimeout(timeout)

      if (status !== ClickChainStatus.WaitingForMoreClicks) {
        return null
      }

      if (clicks.length > 0 && !areClicksSimilar(getWindowStartClick(), click)) {
        dontAcceptMoreClick()
        return null
      }

      clicks.push(click)
      const timeUntilComplete = CLICK_CHAIN_MAX_DURATION_WINDOW - (click.timeStamp - getWindowStartClick().timeStamp)
      timeout = setTimeout(monitor(dontAcceptMoreClick), timeUntilComplete)
      let complete = false
      return {
        markAsComplete: () => {
          if (!complete) {
            complete = true
            completeClicksCount += 1
            tryFlush()
          }
        },
      }
    },
    stop: () => {
      clearTimeout(timeout)
    },
  }
}

/**
 * Checks whether two clicks are similar
 */
function areClicksSimilar(first: BaseClick, second: BaseClick) {
  return (
    first.event.target === second.event.target &&
    // Similar position
    mouseEventDistance(first.event, second.event) < CLICK_CHAIN_MAX_DISTANCE_WINDOW &&
    // Similar time
    first.timeStamp - second.timeStamp <= CLICK_CHAIN_MAX_DURATION_WINDOW
  )
}

function mouseEventDistance(origin: MouseEvent, other: MouseEvent) {
  return Math.sqrt(Math.pow(origin.clientX - other.clientX, 2) + Math.pow(origin.clientY - other.clientY, 2))
}
