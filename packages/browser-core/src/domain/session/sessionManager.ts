import {
  ONE_HOUR,
  ONE_MINUTE,
  ONE_SECOND,
  dateNow,
  elapsed,
  timeStampNow,
  clocksOrigin,
  relativeNow,
} from '@datadog/js-core/time'
import type { TimeStamp, RelativeTime } from '@datadog/js-core/time'
import { Observable } from '../../tools/observable'
import { createValueHistory } from '../../tools/valueHistory'
import { addEventListener, addEventListeners, DOM_EVENT } from '../../browser/addEventListener'
import { clearInterval, clearTimeout, setInterval, setTimeout } from '../../tools/timer'
import { mockable } from '../../tools/mockable'
import { noop, throttle } from '../../tools/utils/functionUtils'
import { generateUUID } from '../../tools/utils/stringUtils'
import type { Configuration } from '../configuration'
import type { TrackingConsentState } from '../trackingConsent'
import { isWorkerEnvironment } from '../../tools/globalObject'
import { display } from '../../tools/display'
import { isSampled } from '../sampler'
import { TelemetryMetrics, addTelemetryMetrics } from '../telemetry'
import { monitorError } from '../../tools/monitor'
import { SESSION_TIME_OUT_DELAY } from './sessionConstants'
import type { SessionState } from './sessionState'
import {
  expandOnly,
  expandOrRenew,
  getCreatedDate,
  getExpireDate,
  getExpiredSessionState,
  initializeSession,
  isSessionInExpiredState,
} from './sessionState'
import { getSessionStoreStrategy, selectSessionStoreStrategyType } from './sessionStore'

export interface SessionManager {
  findSession: (startTime?: RelativeTime, options?: { returnInactive: boolean }) => SessionContext | undefined
  findTrackedSession: (startTime?: RelativeTime, options?: { returnInactive: boolean }) => SessionContext | undefined
  renewObservable: Observable<void>
  expireObservable: Observable<void>
  expire: () => void
  updateSessionState: (state: Partial<SessionState>) => void
}

export interface SessionContext {
  id: string
  anonymousId?: string | undefined
  isReplayForced?: boolean
  createdAt: TimeStamp
}

export const VISIBILITY_CHECK_DELAY = ONE_MINUTE
const SESSION_CONTEXT_TIMEOUT_DELAY = SESSION_TIME_OUT_DELAY

// Maximum duration for which we can send data related to a session.
//
// The backend behavior depends on how old the session is when it receives an event:
// - Session started < 4h ago: the backend updates the session normally.
// - Session started between 4h and 24h ago: the backend ignores the event (safe).
// - Session started > 24h ago: the backend recreates a session with that id (problematic).
//
// We choose 12h as a threshold — safely between 4h and 24h — to avoid both recreating
// sessions and discarding too many legitimate late events.
export const TRACKED_SESSION_MAX_AGE = ONE_HOUR * 12
let stopCallbacks: Array<() => void> = []

export async function startSessionManager(
  configuration: Configuration,
  trackingConsentState: TrackingConsentState
): Promise<SessionManager | undefined> {
  const startTime = relativeNow()
  const renewObservable = new Observable<void>()
  const expireObservable = new Observable<void>()

  const sessionStoreStrategyType = await mockable(selectSessionStoreStrategyType)(configuration)
  if (!sessionStoreStrategyType) {
    display.warn('No storage available for session. We will not send any data.')
    return
  }

  const strategy = mockable(getSessionStoreStrategy)(sessionStoreStrategyType, configuration)

  const sessionContextHistory = createValueHistory<SessionContext>({
    expireDelay: SESSION_CONTEXT_TIMEOUT_DELAY,
  })
  stopCallbacks.push(() => sessionContextHistory.stop())

  let sessionExpired = false

  const { throttled: throttledExpandOrRenew, cancel: cancelExpandOrRenew } = throttle(() => {
    sessionExpired = false
    strategy
      .setSessionState((state) => expandOrRenew(state, configuration), 'expandOrRenewOnActivity')
      .catch(monitorError)
  }, ONE_SECOND)
  stopCallbacks.push(cancelExpandOrRenew)

  let expirationTimeoutId: ReturnType<typeof setTimeout> | undefined
  stopCallbacks.push(() => clearTimeout(expirationTimeoutId))

  let stopped = false
  stopCallbacks.push(() => {
    stopped = true
  })

  let initialState = await resolveInitialState().catch((error) =>
    monitorError(new Error(`Error while resolving initial session state: ${error}`))
  )
  if (!initialState || stopped) {
    return
  }

  // Consent is always granted when the session manager is started, but it may
  // be revoked during the async initialization (e.g., while waiting for cookie lock).
  // Mirror setupSessionTracking's revoke/grant handler until the manager is installed:
  // expire the session in storage, wait for the next grant, then re-resolve.
  while (!trackingConsentState.isGranted()) {
    expire()
    await new Promise<void>((resolve) => trackingConsentState.onGrantedOnce(resolve))
    if (stopped) {
      return
    }
    initialState = await resolveInitialState().catch(monitorError)
    if (!initialState || stopped) {
      return
    }
  }

  sessionContextHistory.add(buildSessionContext(initialState), clocksOrigin().relative)
  scheduleExpirationTimeout(initialState)
  subscribeToSessionChanges()
  setupSessionTracking()

  // monitor-until: 2026-10-15
  addTelemetryMetrics(TelemetryMetrics.SESSION_MANAGER_INIT_METRICS_TELEMETRY_NAME, {
    metrics: { duration: elapsed(startTime, relativeNow()) },
  })

  return buildSessionManager()

  async function resolveInitialState() {
    let state: SessionState = {}
    await strategy.setSessionState((currentState) => {
      const initialState = initializeSession(currentState, configuration)
      state = expandOrRenew(initialState, configuration)
      return state
    }, 'initialize')
    return state
  }

  function subscribeToSessionChanges() {
    const subscription = strategy.sessionObservable.subscribe((sessionState) => {
      scheduleExpirationTimeout(sessionState)
      handleStateChange(sessionState)
    })
    stopCallbacks.push(() => subscription.unsubscribe())
  }

  function scheduleExpirationTimeout(state: SessionState) {
    clearTimeout(expirationTimeoutId)
    const expireDate = getExpireDate(state)
    if (expireDate) {
      const delay = expireDate - dateNow()
      expirationTimeoutId = setTimeout(() => {
        strategy
          .setSessionState((state) => {
            if (isSessionInExpiredState(state)) {
              if (!trackingConsentState.isGranted()) {
                delete state.anonymousId
              }

              return getExpiredSessionState(state, configuration)
            }

            return state
          }, 'expireOnTimeout')
          .catch(monitorError)
      }, delay)
    }
  }

  function setupSessionTracking() {
    trackingConsentState.observable.subscribe(() => {
      if (trackingConsentState.isGranted()) {
        sessionExpired = false
        strategy
          .setSessionState((state) => expandOrRenew(state, configuration), 'expandOrRenewOnConsent')
          .catch(monitorError)
      } else {
        expire()
      }
    })

    if (!isWorkerEnvironment) {
      trackActivity(() => {
        if (trackingConsentState.isGranted()) {
          throttledExpandOrRenew()
        }
      })
      trackVisibility(() => {
        if (!sessionExpired) {
          strategy.setSessionState((state) => expandOnly(state), 'expandOnVisibility').catch(monitorError)
        }
      })
      trackResume(() => {
        strategy
          .setSessionState((state) => initializeSession(state, configuration), 'initializeOnResume')
          .catch(monitorError)
      })
    }
  }

  function buildSessionManager(): SessionManager {
    return {
      findSession: (startTime, options) => sessionContextHistory.find(startTime, options),
      findTrackedSession: (startTime, options) => {
        const session = sessionContextHistory.find(startTime, options)

        if (!session || session.id === 'invalid' || !isSampled(session.id, configuration.sessionSampleRate)) {
          return
        }

        if (dateNow() - session.createdAt > TRACKED_SESSION_MAX_AGE) {
          return
        }

        return session
      },
      renewObservable,
      expireObservable,
      expire,
      updateSessionState: (partialState) => {
        strategy.setSessionState((state) => ({ ...state, ...partialState }), 'updateState').catch(monitorError)
      },
    }
  }

  function handleStateChange(newState: SessionState) {
    const previousSession = sessionContextHistory.find()
    const hadSession = previousSession?.id !== undefined
    const hasSession = newState.id !== undefined
    const sessionIdChanged = hadSession && hasSession && previousSession.id !== newState.id

    if (hadSession && (!hasSession || sessionIdChanged)) {
      // Session expired or replaced
      sessionExpired = true
      expireObservable.notify()
      sessionContextHistory.closeActive(relativeNow())
    }

    if (hasSession && (!hadSession || sessionIdChanged)) {
      if (sessionExpired) {
        // Don't adopt another tab's session — this tab needs its own user interaction to renew
        return
      }
      // New session appeared
      sessionContextHistory.add(buildSessionContext(newState), relativeNow())
      renewObservable.notify()
    } else if (hadSession && hasSession && !sessionIdChanged) {
      // Same session,
      // Mutate the session context in the history for replay forced changes

      previousSession.isReplayForced = !!newState.forcedReplay
    }
  }

  function expire() {
    cancelExpandOrRenew()
    // Update in-memory state synchronously so events stop being collected immediately
    const expiredState = getExpiredSessionState(sessionContextHistory.find(), configuration)
    if (!trackingConsentState.isGranted()) {
      delete expiredState.anonymousId
    }
    handleStateChange(expiredState)
    // Persist to storage asynchronously
    strategy
      .setSessionState((state) => {
        if (!trackingConsentState.isGranted()) {
          delete state.anonymousId
        }
        return getExpiredSessionState(state, configuration)
      }, 'expire')
      .catch(monitorError)
  }

  function buildSessionContext(sessionState: SessionState): SessionContext {
    const createdAt = getCreatedDate(sessionState) ?? timeStampNow()

    if (!sessionState.id) {
      return {
        id: 'invalid',
        isReplayForced: false,
        anonymousId: undefined,
        createdAt,
      }
    }

    return {
      id: sessionState.id,
      isReplayForced: !!sessionState.forcedReplay,
      anonymousId: sessionState.anonymousId,
      createdAt,
    }
  }
}

export function startSessionManagerStub(): Promise<SessionManager> {
  const stubSessionId = generateUUID()
  let sessionContext: SessionContext = {
    id: stubSessionId,
    isReplayForced: false,
    anonymousId: undefined,
    createdAt: timeStampNow(),
  }
  return Promise.resolve({
    findSession: () => sessionContext,
    findTrackedSession: () => sessionContext,
    renewObservable: new Observable(),
    expireObservable: new Observable(),
    expire: noop,
    updateSessionState: (state) => {
      sessionContext = {
        ...sessionContext,
        ...state,
      }
    },
  })
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

function trackResume(cb: () => void) {
  const { stop } = addEventListener(window, DOM_EVENT.RESUME, cb, { capture: true })
  stopCallbacks.push(stop)
}
