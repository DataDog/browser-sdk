import { Observable } from '../../tools/observable'
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
import { SESSION_TIME_OUT_DELAY, SessionPersistence } from './sessionConstants'
import { startSessionStore } from './sessionStore'
import type { SessionState } from './sessionState'
import { toSessionState } from './sessionState'
import { retrieveSessionCookie } from './storeStrategies/sessionInCookie'
import { SESSION_STORE_KEY } from './storeStrategies/sessionStoreStrategy'
import { retrieveSessionFromLocalStorage } from './storeStrategies/sessionInLocalStorage'
import { resetSessionStoreOperations } from './sessionStoreOperations'

export interface SessionManager {
  findSessionState: (
    startTime?: RelativeTime,
    options?: { returnInactive: boolean }
  ) => SessionState | undefined
  renewObservable: Observable<void>
  expireObservable: Observable<void>
  sessionStateUpdateObservable: Observable<{ previousState: SessionState; newState: SessionState }>
  expire: () => void
  updateSessionState: (state: Partial<SessionState>) => void
}

export const VISIBILITY_CHECK_DELAY = ONE_MINUTE
let stopCallbacks: Array<() => void> = []

export function startSessionManager(
  configuration: Configuration,
  productKey: string,
  computeTrackingType: (rawTrackingType?: string) => string,
  trackingConsentState: TrackingConsentState,
  onReady: (sessionManager: SessionManager) => void
) {
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

  const sessionStateHistory = createValueHistory<SessionState>({
    expireDelay: SESSION_TIME_OUT_DELAY,
  })
  stopCallbacks.push(() => sessionStateHistory.stop())

  // Tracking consent is always granted when the session manager is started, but it may be revoked
  // during the async initialization (e.g., while waiting for the Web Lock). We check
  // consent status in the callback to handle this case.
  sessionStore.expandOrRenewSession(() => {
    const hasConsent = trackingConsentState.isGranted()
    if (!hasConsent) {
      sessionStore.expire(hasConsent)
      return
    }

    let currentSessionEntry: ReturnType<typeof sessionStateHistory.add> | undefined

    sessionStore.renewObservable.subscribe(() => {
      const session = sessionStore.getSession()
      if (session) {
        currentSessionEntry = sessionStateHistory.add(session, relativeNow())
      }
      renewObservable.notify()
    })
    sessionStore.expireObservable.subscribe(() => {
      expireObservable.notify()
      sessionStateHistory.closeActive(relativeNow())
      currentSessionEntry = undefined
    })

    // Update the current session entry when the session state is updated (e.g., forcedReplay)
    sessionStore.sessionStateUpdateObservable.subscribe(({ newState }) => {
      if (currentSessionEntry) {
        currentSessionEntry.value = newState
      }
    })

    const initialSession = sessionStore.getSession()
    if (initialSession) {
      currentSessionEntry = sessionStateHistory.add(initialSession, clocksOrigin().relative)
    } else {
      reportUnexpectedSessionState(configuration).catch(() => void 0) // Ignore errors
    }
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

    onReady({
      findSessionState: (startTime, options) => sessionStateHistory.find(startTime, options),
      renewObservable,
      expireObservable,
      sessionStateUpdateObservable: sessionStore.sessionStateUpdateObservable,
      expire: sessionStore.expire,
      updateSessionState: sessionStore.updateSessionState,
    })
  })
}

export function stopSessionManager() {
  stopCallbacks.forEach((e) => e())
  stopCallbacks = []
  resetSessionStoreOperations()
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
            // monitor-until: 2026-04-01, after RUM-10845 investigation done
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
