import { Observable } from '../../tools/observable'
import type { Context } from '../../tools/serialisation/context'
import { createValueHistory } from '../../tools/valueHistory'
import type { RelativeTime } from '../../tools/utils/timeUtils'
import { clocksOrigin, dateNow, ONE_MINUTE, relativeNow } from '../../tools/utils/timeUtils'
import { addEventListener, addEventListeners, DOM_EVENT } from '../../browser/addEventListener'
import { clearInterval, setInterval } from '../../tools/timer'
import type { Configuration } from '../configuration'
import type { TrackingConsentState } from '../trackingConsent'
import { addTelemetryDebug } from '../telemetry'
import { isSyntheticsTest } from '../synthetics/syntheticsWorkerValues'
import type { CookieStore } from '../../browser/browser.types'
import { getCurrentSite } from '../../browser/cookie'
import { ExperimentalFeature, isExperimentalFeatureEnabled } from '../../tools/experimentalFeatures'
import { findLast } from '../../tools/utils/polyfills'
import { monitorError } from '../../tools/monitor'
import { SESSION_NOT_TRACKED, SESSION_TIME_OUT_DELAY, SessionPersistence } from './sessionConstants'
import { startSessionStore } from './sessionStore'
import type { SessionState } from './sessionState'
import { toSessionState } from './sessionState'
import { retrieveSessionCookie } from './storeStrategies/sessionInCookie'
import { SESSION_STORE_KEY } from './storeStrategies/sessionStoreStrategy'
import { retrieveSessionFromLocalStorage } from './storeStrategies/sessionInLocalStorage'

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
  if (isExperimentalFeatureEnabled(ExperimentalFeature.SHORT_SESSION_INVESTIGATION)) {
    const session = sessionStore.getSession()
    if (session) {
      detectSessionIdChange(configuration, session)
    }
  }

  trackingConsentState.observable.subscribe(() => {
    if (trackingConsentState.isGranted()) {
      sessionStore.expandOrRenewSession()
    } else {
      sessionStore.expire(false)
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
      reportUnexpectedSessionState(configuration).catch(() => void 0) // Ignore errors

      return {
        id: 'invalid',
        trackingType: SESSION_NOT_TRACKED as TrackingType,
        isReplayForced: false,
        anonymousId: undefined,
      }
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

async function reportUnexpectedSessionState(configuration: Configuration) {
  const sessionStoreStrategyType = configuration.sessionStoreStrategyType
  if (!sessionStoreStrategyType) {
    return
  }

  let rawSession
  let cookieContext

  if (sessionStoreStrategyType.type === SessionPersistence.COOKIE) {
    rawSession = retrieveSessionCookie(sessionStoreStrategyType.cookieOptions, configuration)

    cookieContext = {
      cookie: await getSessionCookies(),
      currentDomain: `${window.location.protocol}//${window.location.hostname}`,
    }
  } else {
    rawSession = retrieveSessionFromLocalStorage()
  }
  // monitor-until: forever, could be handy to troubleshoot issues until session manager rework
  addTelemetryDebug('Unexpected session state', {
    sessionStoreStrategyType: sessionStoreStrategyType.type,
    session: rawSession,
    isSyntheticsTest: isSyntheticsTest(),
    createdTimestamp: rawSession?.created,
    expireTimestamp: rawSession?.expire,
    ...cookieContext,
  })
}

function detectSessionIdChange(configuration: Configuration, initialSessionState: SessionState) {
  if (!window.cookieStore || !initialSessionState.created) {
    return
  }

  const sessionCreatedTime = Number(initialSessionState.created)
  const sdkInitTime = dateNow()

  const { stop } = addEventListener(configuration, cookieStore as CookieStore, DOM_EVENT.CHANGE, listener)
  stopCallbacks.push(stop)

  function listener(event: CookieChangeEvent) {
    const changed = findLast(event.changed, (change): change is CookieListItem => change.name === SESSION_STORE_KEY)
    if (!changed) {
      return
    }

    const sessionAge = dateNow() - sessionCreatedTime
    if (sessionAge > 14 * ONE_MINUTE) {
      // The session might have expired just because it's too old or lack activity
      stop()
    } else {
      const newSessionState = toSessionState(changed.value)
      if (newSessionState.id && newSessionState.id !== initialSessionState.id) {
        stop()
        const time = dateNow() - sdkInitTime
        getSessionCookies()
          .then((cookie) => {
            // monitor-until: 2025-12-01, after RUM-10845 investigation done
            addTelemetryDebug('Session cookie changed', {
              time,
              session_age: sessionAge,
              old: initialSessionState,
              new: newSessionState,
              cookie,
            })
          })
          .catch(monitorError)
      }
    }
  }
}

async function getSessionCookies(): Promise<{ count: number; domain: string }> {
  let sessionCookies: string[] | Awaited<ReturnType<CookieStore['getAll']>>
  if ('cookieStore' in window) {
    sessionCookies = await (window as { cookieStore: CookieStore }).cookieStore.getAll(SESSION_STORE_KEY)
  } else {
    sessionCookies = document.cookie.split(/\s*;\s*/).filter((cookie) => cookie.startsWith(SESSION_STORE_KEY))
  }

  return {
    count: sessionCookies.length,
    domain: getCurrentSite() || 'undefined',
    ...sessionCookies,
  }
}
