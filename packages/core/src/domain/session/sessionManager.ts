import { Observable } from '../../tools/observable'
import { createValueHistory } from '../../tools/valueHistory'
import type { RelativeTime } from '../../tools/utils/timeUtils'
import { clocksOrigin, dateNow, ONE_MINUTE, ONE_SECOND, relativeNow } from '../../tools/utils/timeUtils'
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
import { monitorError } from '../../tools/monitor'
import { getCookies } from '../../browser/cookie'
import { SESSION_TIME_OUT_DELAY } from './sessionConstants'
import type { SessionState } from './sessionState'
import {
  expandOnly,
  expandOrRenew,
  getExpiredSessionState,
  initializeSession,
  isSessionInExpiredState,
} from './sessionState'
import { getSessionStoreStrategy } from './sessionStore'

export interface SessionManager {
  findSession: (startTime?: RelativeTime, options?: { returnInactive: boolean }) => SessionContext | undefined
  findTrackedSession: (startTime?: RelativeTime, options?: { returnInactive: boolean }) => SessionContext | undefined
  renewObservable: Observable<SessionRenewalEvent>
  expireObservable: Observable<void>
  expire: () => void
  updateSessionState: (state: Partial<SessionState>) => void
}

interface SessionDebugContext {
  previousSession?: SessionContext
  newState: SessionState
  from: string
  cookieValue: string | undefined
  cookies: string[]
  locksAvailable: boolean
  cookieStoreAvailable: boolean
}
export interface SessionRenewalEvent {
  expire: SessionDebugContext | undefined
  renew: SessionDebugContext
}

export interface SessionContext {
  id: string
  anonymousId?: string | undefined
  isReplayForced?: boolean
}

export const VISIBILITY_CHECK_DELAY = ONE_MINUTE
const SESSION_CONTEXT_TIMEOUT_DELAY = SESSION_TIME_OUT_DELAY
let stopCallbacks: Array<() => void> = []

export async function startSessionManager(
  configuration: Configuration,
  trackingConsentState: TrackingConsentState
): Promise<SessionManager | undefined> {
  const renewObservable = new Observable<SessionRenewalEvent>()
  const expireObservable = new Observable<void>()
  let expireContext: SessionDebugContext | undefined

  if (!configuration.sessionStoreStrategyType) {
    display.warn('No storage available for session. We will not send any data.')
    return
  }

  const strategy = mockable(getSessionStoreStrategy)(configuration.sessionStoreStrategyType, configuration)

  const sessionContextHistory = createValueHistory<SessionContext>({
    expireDelay: SESSION_CONTEXT_TIMEOUT_DELAY,
  })
  stopCallbacks.push(() => sessionContextHistory.stop())

  const { throttled: throttledExpandOrRenew, cancel: cancelExpandOrRenew } = throttle(() => {
    strategy.setSessionState((state) => expandOrRenew(state, configuration)).catch(monitorError)
  }, ONE_SECOND)
  stopCallbacks.push(cancelExpandOrRenew)

  let expirationTimeoutId: ReturnType<typeof setTimeout> | undefined
  stopCallbacks.push(() => clearTimeout(expirationTimeoutId))

  let stopped = false
  stopCallbacks.push(() => {
    stopped = true
  })

  const initialState = await resolveInitialState().catch(monitorError)
  if (!initialState || stopped) {
    return
  }

  // Consent is always granted when the session manager is started, but it may
  // be revoked during the async initialization (e.g., while waiting for cookie lock).
  if (!trackingConsentState.isGranted()) {
    expire()
    return
  }

  sessionContextHistory.add(buildSessionContext(initialState), clocksOrigin().relative)
  scheduleExpirationTimeout(initialState)
  subscribeToSessionChanges()
  setupSessionTracking()
  return buildSessionManager()

  async function resolveInitialState() {
    let state: SessionState = {}
    await strategy.setSessionState((currentState) => {
      const initialState = initializeSession(currentState, configuration)
      state = expandOrRenew(initialState, configuration)
      return state
    })
    return state
  }

  function subscribeToSessionChanges() {
    const subscription = strategy.sessionObservable.subscribe(({ cookieValue, sessionState }) => {
      scheduleExpirationTimeout(sessionState)
      handleStateChange(sessionState, { from: 'sessionObservable', cookieValue })
    })
    stopCallbacks.push(() => subscription.unsubscribe())
  }

  function scheduleExpirationTimeout(state: SessionState) {
    clearTimeout(expirationTimeoutId)
    if (state.expire && !isSessionInExpiredState(state)) {
      const delay = Number(state.expire) - dateNow()
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
          })
          .catch(monitorError)
      }, delay)
    }
  }

  function setupSessionTracking() {
    trackingConsentState.observable.subscribe(() => {
      if (trackingConsentState.isGranted()) {
        strategy.setSessionState((state) => expandOrRenew(state, configuration)).catch(monitorError)
      } else {
        expire()
      }
    })

    if (!isWorkerEnvironment) {
      trackActivity(configuration, () => {
        if (trackingConsentState.isGranted()) {
          throttledExpandOrRenew()
        }
      })
      trackVisibility(configuration, () => {
        strategy.setSessionState((state) => expandOnly(state)).catch(monitorError)
      })
      trackResume(configuration, () => {
        strategy.setSessionState((state) => initializeSession(state, configuration)).catch(monitorError)
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

        return session
      },
      renewObservable,
      expireObservable,
      expire,
      updateSessionState: (partialState) => {
        strategy.setSessionState((state) => ({ ...state, ...partialState })).catch(monitorError)
      },
    }
  }

  function handleStateChange(newState: SessionState, { from, cookieValue }: { from: string; cookieValue?: string }) {
    const previousSession = sessionContextHistory.find()
    const hadSession = previousSession?.id !== undefined
    const hasSession = newState.id !== undefined
    const sessionIdChanged = hadSession && hasSession && previousSession.id !== newState.id

    if (hadSession && (!hasSession || sessionIdChanged)) {
      // Session expired or replaced
      expireContext = {
        previousSession: previousSession && { ...previousSession },
        newState: { ...newState },
        from,
        cookieValue,
        cookies: getCookies('_dd_s'),
        locksAvailable: Boolean(globalThis.navigator?.locks),
        cookieStoreAvailable: Boolean(globalThis.cookieStore),
      }
      expireObservable.notify()
      sessionContextHistory.closeActive(relativeNow())
    }

    if (hasSession && (!hadSession || sessionIdChanged)) {
      // New session appeared
      sessionContextHistory.add(buildSessionContext(newState), relativeNow())
      renewObservable.notify({
        expire: expireContext,
        renew: {
          previousSession: previousSession && { ...previousSession },
          newState: { ...newState },
          from,
          cookieValue,
          cookies: getCookies('_dd_s'),
          locksAvailable: Boolean(globalThis.navigator?.locks),
          cookieStoreAvailable: Boolean(globalThis.cookieStore),
        },
      })
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
    handleStateChange(expiredState, { from: 'expire' })
    // Persist to storage asynchronously
    strategy
      .setSessionState((state) => {
        if (!trackingConsentState.isGranted()) {
          delete state.anonymousId
        }
        return getExpiredSessionState(state, configuration)
      })
      .catch(monitorError)
  }

  function buildSessionContext(sessionState: SessionState): SessionContext {
    if (!sessionState.id) {
      return {
        id: 'invalid',
        isReplayForced: false,
        anonymousId: undefined,
      }
    }

    return {
      id: sessionState.id,
      isReplayForced: !!sessionState.forcedReplay,
      anonymousId: sessionState.anonymousId,
    }
  }
}

export function startSessionManagerStub(): Promise<SessionManager> {
  const stubSessionId = generateUUID()
  let sessionContext: SessionContext = {
    id: stubSessionId,
    isReplayForced: false,
    anonymousId: undefined,
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
