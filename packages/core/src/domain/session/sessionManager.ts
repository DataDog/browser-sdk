import type { Observable } from '../../tools/observable'
import type { Context } from '../../tools/serialisation/context'
import { AFTER_ENTRY_START, ValueHistory } from '../../tools/valueHistory'
import type { RelativeTime } from '../../tools/utils/timeUtils'
import { relativeNow, clocksOrigin, ONE_MINUTE } from '../../tools/utils/timeUtils'
import { DOM_EVENT, addEventListener, addEventListeners } from '../../browser/addEventListener'
import { clearInterval, setInterval } from '../../tools/timer'
import type { Configuration } from '../configuration'
import { SESSION_TIME_OUT_DELAY } from './sessionConstants'
import { startSessionStore } from './sessionStore'

export interface SessionManager<TrackingType extends string> {
  findActiveSession: (startTime?: RelativeTime) => SessionContext<TrackingType> | undefined
  findActiveOrExpiredSession: (startTime?: RelativeTime) => SessionContext<TrackingType> | undefined

  renewObservable: Observable<void>
  expireObservable: Observable<void>
  expire: () => void
}

export interface SessionContext<TrackingType extends string> extends Context {
  id: string
  trackingType: TrackingType
  endTime?: RelativeTime
}

export const VISIBILITY_CHECK_DELAY = ONE_MINUTE
const SESSION_CONTEXT_TIMEOUT_DELAY = SESSION_TIME_OUT_DELAY
let stopCallbacks: Array<() => void> = []

export function startSessionManager<TrackingType extends string>(
  configuration: Configuration,
  productKey: string,
  computeSessionState: (rawTrackingType?: string) => { trackingType: TrackingType; isTracked: boolean }
): SessionManager<TrackingType> {
  // TODO - Improve configuration type and remove assertion
  const sessionStore = startSessionStore(configuration.sessionStoreStrategyType!, productKey, computeSessionState)
  stopCallbacks.push(() => sessionStore.stop())

  const sessionContextHistory = new ValueHistory<SessionContext<TrackingType>>(SESSION_CONTEXT_TIMEOUT_DELAY)
  stopCallbacks.push(() => sessionContextHistory.stop())

  let currentSessionContext = buildSessionContext()

  sessionStore.renewObservable.subscribe(() => {
    currentSessionContext = buildSessionContext()
    sessionContextHistory.add(currentSessionContext, relativeNow())
  })
  sessionStore.expireObservable.subscribe(() => {
    currentSessionContext.endTime = relativeNow()
    sessionContextHistory.closeActive(currentSessionContext.endTime)
  })

  sessionStore.expandOrRenewSession()
  sessionContextHistory.add(currentSessionContext, clocksOrigin().relative)

  trackActivity(configuration, () => sessionStore.expandOrRenewSession())
  trackVisibility(configuration, () => sessionStore.expandSession())

  function buildSessionContext(): SessionContext<TrackingType> {
    return {
      id: sessionStore.getSession().id!,
      trackingType: sessionStore.getSession()[productKey] as TrackingType,
    }
  }

  return {
    findActiveSession: (startTime) => sessionContextHistory.find(startTime),
    findActiveOrExpiredSession: (startTime) => sessionContextHistory.find(startTime, AFTER_ENTRY_START),
    renewObservable: sessionStore.renewObservable,
    expireObservable: sessionStore.expireObservable,
    expire: sessionStore.expire,
  }
}

export function stopSessionManager() {
  stopCallbacks.forEach((e) => e())
  stopCallbacks = []
}

function trackActivity(configuration: Configuration, expandOrRenewSession: () => void) {
  const { stop } = addEventListeners(
    configuration,
    window,
    [DOM_EVENT.CLICK, DOM_EVENT.TOUCH_START, DOM_EVENT.KEY_DOWN, DOM_EVENT.SCROLL],
    expandOrRenewSession,
    { capture: true, passive: true }
  )
  stopCallbacks.push(stop)
}

function trackVisibility(configuration: Configuration, expandSession: () => void) {
  const expandSessionWhenVisible = () => {
    if (document.visibilityState === 'visible') {
      expandSession()
    }
  }

  const { stop } = addEventListener(configuration, document, DOM_EVENT.VISIBILITY_CHANGE, expandSessionWhenVisible)
  stopCallbacks.push(stop)

  const visibilityCheckInterval = setInterval(expandSessionWhenVisible, VISIBILITY_CHECK_DELAY)
  stopCallbacks.push(() => {
    clearInterval(visibilityCheckInterval)
  })
}
