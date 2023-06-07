import type { Observable } from '../../tools/observable'
import type { Context } from '../../tools/serialisation/context'
import { ValueHistory } from '../../tools/valueHistory'
import type { RelativeTime } from '../../tools/utils/timeUtils'
import { relativeNow, clocksOrigin, ONE_MINUTE } from '../../tools/utils/timeUtils'
import { DOM_EVENT, addEventListener, addEventListeners } from '../../browser/addEventListener'
import { clearInterval, setInterval } from '../../tools/timer'
import { SESSION_TIME_OUT_DELAY } from './sessionConstants'
import { startSessionStore } from './sessionStore'
import type { SessionStoreStrategyType } from './storeStrategies/sessionStoreStrategy'

export interface SessionManager<TrackingType extends string> {
  findActiveSession: (startTime?: RelativeTime) => SessionContext<TrackingType> | undefined
  renewObservable: Observable<void>
  expireObservable: Observable<void>
  expire: () => void
}

export interface SessionContext<TrackingType extends string> extends Context {
  id: string
  trackingType: TrackingType
}

export const VISIBILITY_CHECK_DELAY = ONE_MINUTE
const SESSION_CONTEXT_TIMEOUT_DELAY = SESSION_TIME_OUT_DELAY
let stopCallbacks: Array<() => void> = []

export function startSessionManager<TrackingType extends string>(
  sessionStoreStrategyType: SessionStoreStrategyType,
  productKey: string,
  computeSessionState: (rawTrackingType?: string) => { trackingType: TrackingType; isTracked: boolean }
): SessionManager<TrackingType> {
  const sessionStore = startSessionStore(sessionStoreStrategyType, productKey, computeSessionState)
  stopCallbacks.push(() => sessionStore.stop())

  const sessionContextHistory = new ValueHistory<SessionContext<TrackingType>>(SESSION_CONTEXT_TIMEOUT_DELAY)
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
    expire: sessionStore.expire,
  }
}

export function stopSessionManager() {
  stopCallbacks.forEach((e) => e())
  stopCallbacks = []
}

function trackActivity(expandOrRenewSession: () => void) {
  const { stop } = addEventListeners(
    window,
    [DOM_EVENT.CLICK, DOM_EVENT.TOUCH_START, DOM_EVENT.KEY_DOWN, DOM_EVENT.SCROLL],
    expandOrRenewSession,
    { capture: true, passive: true }
  )
  stopCallbacks.push(stop)
}

function trackVisibility(expandSession: () => void) {
  const expandSessionWhenVisible = () => {
    if (document.visibilityState === 'visible') {
      expandSession()
    }
  }

  const { stop } = addEventListener(document, DOM_EVENT.VISIBILITY_CHANGE, expandSessionWhenVisible)
  stopCallbacks.push(stop)

  const visibilityCheckInterval = setInterval(expandSessionWhenVisible, VISIBILITY_CHECK_DELAY)
  stopCallbacks.push(() => {
    clearInterval(visibilityCheckInterval)
  })
}
