import { CookieOptions } from '../../browser/cookie'
import { Observable } from '../../tools/observable'
import * as utils from '../../tools/utils'
import { monitor } from '../internalMonitoring'
import { tryOldCookiesMigration } from './oldCookiesMigration'
import { startSessionStore } from './sessionStore'

export const VISIBILITY_CHECK_DELAY = utils.ONE_MINUTE

export interface Session<T> {
  renewObservable: Observable<void>
  getId: () => string | undefined
  getTrackingType: () => T | undefined
}

export function startSessionManagement<TrackingType extends string>(
  options: CookieOptions,
  productKey: string,
  computeSessionState: (rawTrackingType?: string) => { trackingType: TrackingType; isTracked: boolean }
): Session<TrackingType> {
  tryOldCookiesMigration(options)
  const sessionStore = startSessionStore(options, productKey, computeSessionState)

  sessionStore.expandOrRenewSession()
  trackActivity(() => sessionStore.expandOrRenewSession())
  trackVisibility(() => sessionStore.expandSession())

  return {
    getId: () => sessionStore.retrieveSession().id,
    getTrackingType: () => sessionStore.retrieveSession()[productKey] as TrackingType | undefined,
    renewObservable: sessionStore.renewObservable,
  }
}

export function stopSessionManagement() {
  stopCallbacks.forEach((e) => e())
  stopCallbacks = []
}

let stopCallbacks: Array<() => void> = []

function trackActivity(expandOrRenewSession: () => void) {
  const { stop } = utils.addEventListeners(
    window,
    [utils.DOM_EVENT.CLICK, utils.DOM_EVENT.TOUCH_START, utils.DOM_EVENT.KEY_DOWN, utils.DOM_EVENT.SCROLL],
    expandOrRenewSession,
    { capture: true, passive: true }
  )
  stopCallbacks.push(stop)
}

function trackVisibility(expandSession: () => void) {
  const expandSessionWhenVisible = monitor(() => {
    if (document.visibilityState === 'visible') {
      expandSession()
    }
  })

  const { stop } = utils.addEventListener(document, utils.DOM_EVENT.VISIBILITY_CHANGE, expandSessionWhenVisible)
  stopCallbacks.push(stop)

  const visibilityCheckInterval = setInterval(expandSessionWhenVisible, VISIBILITY_CHECK_DELAY)
  stopCallbacks.push(() => {
    clearInterval(visibilityCheckInterval)
  })
}
