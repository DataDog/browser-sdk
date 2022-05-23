import type { CookieOptions } from '../../browser/cookie'
import type { Observable } from '../../tools/observable'
import * as utils from '../../tools/utils'
import { monitor } from '../telemetry'
import type { Context } from '../../tools/context'
import { ContextHistory } from '../../tools/contextHistory'
import type { RelativeTime } from '../../tools/timeUtils'
import { relativeNow, clocksOrigin } from '../../tools/timeUtils'
import { tryOldCookiesMigration } from './oldCookiesMigration'
import { startSessionStore, SESSION_TIME_OUT_DELAY } from './sessionStore'

export interface SessionManager<TrackingType extends string> {
  findActiveSession: (startTime?: RelativeTime) => SessionContext<TrackingType> | undefined
  renewObservable: Observable<void>
  expireObservable: Observable<void>
}

export interface SessionContext<TrackingType extends string> extends Context {
  id: string
  trackingType: TrackingType
}

export const VISIBILITY_CHECK_DELAY = utils.ONE_MINUTE
const SESSION_CONTEXT_TIMEOUT_DELAY = SESSION_TIME_OUT_DELAY
let stopCallbacks: Array<() => void> = []

export function startSessionManager<TrackingType extends string>(
  options: CookieOptions,
  productKey: string,
  computeSessionState: (rawTrackingType?: string) => { trackingType: TrackingType; isTracked: boolean }
): SessionManager<TrackingType> {
  tryOldCookiesMigration(options)
  const sessionStore = startSessionStore(options, productKey, computeSessionState)
  stopCallbacks.push(() => sessionStore.stop())

  const sessionContextHistory = new ContextHistory<SessionContext<TrackingType>>(SESSION_CONTEXT_TIMEOUT_DELAY)
  stopCallbacks.push(() => sessionContextHistory.stop())

  sessionStore.renewObservable.subscribe(() => {
    sessionContextHistory.add(buildSessionContext(), relativeNow())
  })
  sessionStore.expireObservable.subscribe(() => {
    sessionContextHistory.closeActive(relativeNow())
  })

  sessionStore.expandOrRenewSession()
  sessionContextHistory.add(buildSessionContext(), clocksOrigin().relative)

  trackActivity(() => sessionStore.expandOrRenewSession())
  trackVisibility(() => sessionStore.expandSession())

  function buildSessionContext() {
    return {
      id: sessionStore.getSession().id!,
      trackingType: sessionStore.getSession()[productKey] as TrackingType,
    }
  }

  return {
    findActiveSession: (startTime) => sessionContextHistory.find(startTime),
    renewObservable: sessionStore.renewObservable,
    expireObservable: sessionStore.expireObservable,
  }
}

export function stopSessionManager() {
  stopCallbacks.forEach((e) => e())
  stopCallbacks = []
}

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
