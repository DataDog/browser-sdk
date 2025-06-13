import { Observable } from '../../tools/observable'
import type { Context } from '../../tools/serialisation/context'
import { createValueHistory } from '../../tools/valueHistory'
import type { RelativeTime } from '../../tools/utils/timeUtils'
import { relativeNow, clocksOrigin, ONE_MINUTE, dateNow } from '../../tools/utils/timeUtils'
import { DOM_EVENT, addEventListener, addEventListeners } from '../../browser/addEventListener'
import { clearInterval, setInterval } from '../../tools/timer'
import type { Configuration } from '../configuration'
import type { TrackingConsentState } from '../trackingConsent'
import { addTelemetryDebug } from '../telemetry'
import { isSyntheticsTest } from '../synthetics/syntheticsWorkerValues'
import { SESSION_TIME_OUT_DELAY } from './sessionConstants'
import { startSessionStore } from './sessionStore'
import type { SessionState } from './sessionState'
import { retrieveSessionCookie } from './storeStrategies/sessionInCookie'

export interface SessionManager<TrackingType extends string> {
  findSession: (
    startTime?: RelativeTime,
    options?: { returnInactive: boolean }
  ) => SessionContext<TrackingType> | undefined
  renewObservable: Observable<void>
  expireObservable: Observable<void>
  sessionStateUpdateObservable: Observable<{ previousState: SessionState; newState: SessionState }>
  expire: () => void
  updateSessionState: (state: Partial<SessionState>) => void
}

export interface SessionContext<TrackingType extends string> extends Context {
  id: string
  trackingType: TrackingType
  isReplayForced: boolean
  anonymousId: string | undefined
}

export const VISIBILITY_CHECK_DELAY = ONE_MINUTE
const SESSION_CONTEXT_TIMEOUT_DELAY = SESSION_TIME_OUT_DELAY
let stopCallbacks: Array<() => void> = []

export function startSessionManager<TrackingType extends string>(
  configuration: Configuration,
  productKey: string,
  computeTrackingType: (rawTrackingType?: string) => TrackingType,
  trackingConsentState: TrackingConsentState
): SessionManager<TrackingType> {
  const renewObservable = new Observable<void>()
  const expireObservable = new Observable<void>()

  // TODO - Improve configuration type and remove assertion
  const sessionStore = startSessionStore(
    configuration.sessionStoreStrategyType!,
    configuration,
    productKey,
    computeTrackingType
  )
  stopCallbacks.push(() => sessionStore.stop())

  const sessionContextHistory = createValueHistory<SessionContext<TrackingType>>({
    expireDelay: SESSION_CONTEXT_TIMEOUT_DELAY,
  })
  stopCallbacks.push(() => sessionContextHistory.stop())

  sessionStore.renewObservable.subscribe(() => {
    sessionContextHistory.add(buildSessionContext(), relativeNow())
    renewObservable.notify()
  })
  sessionStore.expireObservable.subscribe(() => {
    expireObservable.notify()
    sessionContextHistory.closeActive(relativeNow())
  })

  // We expand/renew session unconditionally as tracking consent is always granted when the session
  // manager is started.
  sessionStore.expandOrRenewSession()
  sessionContextHistory.add(buildSessionContext(), clocksOrigin().relative)

  trackingConsentState.observable.subscribe(() => {
    if (trackingConsentState.isGranted()) {
      sessionStore.expandOrRenewSession()
    } else {
      sessionStore.expire()
    }
  })

  trackActivity(configuration, () => {
    if (trackingConsentState.isGranted()) {
      sessionStore.expandOrRenewSession()
    }
  })
  trackVisibility(configuration, () => sessionStore.expandSession())
  trackResume(configuration, () => sessionStore.restartSession())

  function buildSessionContext() {
    const session = sessionStore.getSession()

    if (!session) {
      const rawSession = retrieveSessionCookie()
      const debugData: any = {
        session: rawSession,
        isSyntheticsTest: isSyntheticsTest(),
      }

      if (rawSession?.created) {
        const createdTime = Number(rawSession.created)
        const timeFromCreated = dateNow() - createdTime
        debugData.timeFromCreated = timeFromCreated
      }

      if (rawSession?.expire) {
        const expireTime = Number(rawSession.expire)
        const timeToExpire = expireTime - dateNow()
        debugData.timeToExpire = timeToExpire
      }

      debugData.differenceCreatedToExpire = Number(rawSession?.expire) - Number(rawSession?.created)

      addTelemetryDebug('Unexpected session state', debugData)
    }

    return {
      id: session.id!,
      trackingType: session[productKey] as TrackingType,
      isReplayForced: !!session.forcedReplay,
      anonymousId: session.anonymousId,
    }
  }

  return {
    findSession: (startTime, options) => sessionContextHistory.find(startTime, options),
    renewObservable,
    expireObservable,
    sessionStateUpdateObservable: sessionStore.sessionStateUpdateObservable,
    expire: sessionStore.expire,
    updateSessionState: sessionStore.updateSessionState,
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

function trackResume(configuration: Configuration, cb: () => void) {
  const { stop } = addEventListener(configuration, window, DOM_EVENT.RESUME, cb, { capture: true })
  stopCallbacks.push(stop)
}
