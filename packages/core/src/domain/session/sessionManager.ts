import { Observable } from '../../tools/observable'
import { createValueHistory } from '../../tools/valueHistory'
import type { RelativeTime } from '../../tools/utils/timeUtils'
import { clocksOrigin, dateNow, ONE_MINUTE, ONE_SECOND, relativeNow } from '../../tools/utils/timeUtils'
import { addEventListener, addEventListeners, DOM_EVENT } from '../../browser/addEventListener'
import { clearInterval, setInterval } from '../../tools/timer'
import { mockable } from '../../tools/mockable'
import { noop, throttle } from '../../tools/utils/functionUtils'
import { generateUUID } from '../../tools/utils/stringUtils'
import type { Configuration } from '../configuration'
import type { TrackingConsentState } from '../trackingConsent'
import { isWorkerEnvironment } from '../../tools/globalObject'
import { display } from '../../tools/display'
import { isSampled } from '../sampler'
import { monitorError } from '../../tools/monitor'
import { SESSION_TIME_OUT_DELAY } from './sessionConstants'
import type { SessionState } from './sessionState'
import {
  expandSessionState,
  getExpiredSessionState,
  isSessionInExpiredState,
  isSessionInNotStartedState,
} from './sessionState'
import { getSessionStoreStrategy } from './sessionStore'

export interface SessionManager {
  findSession: (startTime?: RelativeTime, options?: { returnInactive: boolean }) => SessionContext | undefined
  findTrackedSession: (startTime?: RelativeTime, options?: { returnInactive: boolean }) => SessionContext | undefined
  renewObservable: Observable<void>
  expireObservable: Observable<void>
  sessionStateUpdateObservable: Observable<{ previousState: SessionState; newState: SessionState }>
  expire: () => void
  updateSessionState: (state: Partial<SessionState>) => void
}

export interface SessionContext {
  id: string
  anonymousId?: string | undefined
  isReplayForced?: boolean
}

export const VISIBILITY_CHECK_DELAY = ONE_MINUTE
const SESSION_CONTEXT_TIMEOUT_DELAY = SESSION_TIME_OUT_DELAY
let stopCallbacks: Array<() => void> = []

// Session state helper functions

function initializeSession(state: SessionState, configuration: Configuration): SessionState {
  if (isSessionInNotStartedState(state)) {
    if (configuration.trackAnonymousUser) {
      state.anonymousId = generateUUID()
    }
    return getExpiredSessionState(state, configuration)
  }
  return state
}

function expandOrRenew(state: SessionState, configuration: Configuration): SessionState {
  if (isSessionInNotStartedState(state)) {
    return state
  }

  if (!state.id) {
    state.id = generateUUID()
    state.created = String(dateNow())
  }
  if (configuration.trackAnonymousUser && !state.anonymousId) {
    state.anonymousId = generateUUID()
  }

  delete state.isExpired
  expandSessionState(state)

  return state
}

function expandOnly(state: SessionState): SessionState {
  if (isSessionInExpiredState(state) || isSessionInNotStartedState(state) || !state.id) {
    return state
  }
  expandSessionState(state)
  return state
}

export function startSessionManager(
  configuration: Configuration,
  trackingConsentState: TrackingConsentState,
  onReady: (sessionManager: SessionManager) => void
) {
  const renewObservable = new Observable<void>()
  const expireObservable = new Observable<void>()
  const sessionStateUpdateObservable = new Observable<{ previousState: SessionState; newState: SessionState }>()

  if (!configuration.sessionStoreStrategyType) {
    display.warn('No storage available for session. We will not send any data.')
    return
  }

  const strategy = mockable(getSessionStoreStrategy)(configuration.sessionStoreStrategyType, configuration)

  const sessionContextHistory = createValueHistory<SessionContext>({
    expireDelay: SESSION_CONTEXT_TIMEOUT_DELAY,
  })
  stopCallbacks.push(() => sessionContextHistory.stop())

  let previousState: SessionState = {}

  const { throttled: throttledExpandOrRenew, cancel: cancelExpandOrRenew } = throttle(() => {
    strategy.setSessionState((state) => expandOrRenew(state, configuration)).catch(monitorError)
  }, ONE_SECOND)
  stopCallbacks.push(cancelExpandOrRenew)

  let stopped = false
  stopCallbacks.push(() => {
    stopped = true
  })
  ;(async () => {
    const initialState = await resolveInitialState()
    if (stopped) {
      return
    }

    // Consent is always granted when the session manager is started, but it may
    // be revoked during the async initialization (e.g., while waiting for cookie lock).
    if (!trackingConsentState.isGranted()) {
      expire()
      return
    }

    subscribeToSessionChanges(initialState)
    setupSessionTracking()
    onReady(buildSessionManager())
  })().catch(monitorError)

  async function resolveInitialState() {
    let state: SessionState = {}
    await strategy.setSessionState((currentState) => {
      const init = initializeSession(currentState, configuration)
      state = expandOrRenew(init, configuration)
      return state
    })
    if (isSessionInExpiredState(state)) {
      state = getExpiredSessionState(state, configuration)
    }
    return state
  }

  function subscribeToSessionChanges(initialState: SessionState) {
    previousState = initialState
    sessionContextHistory.add(buildSessionContext(initialState), clocksOrigin().relative)

    const subscription = strategy.sessionObservable.subscribe((newState) => {
      if (isSessionInExpiredState(newState)) {
        newState = getExpiredSessionState(newState, configuration)
      }
      handleStateChange(newState)
      previousState = newState
    })
    stopCallbacks.push(() => subscription.unsubscribe())
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
      sessionStateUpdateObservable,
      expire,
      updateSessionState: (partialState) => {
        strategy.setSessionState((state) => ({ ...state, ...partialState })).catch(monitorError)
      },
    }
  }

  function handleStateChange(newState: SessionState) {
    const hadSession = previousState.id !== undefined
    const hasSession = newState.id !== undefined
    const sessionIdChanged = hadSession && hasSession && previousState.id !== newState.id

    if (hadSession && (!hasSession || sessionIdChanged)) {
      // Session expired or replaced
      expireObservable.notify()
      sessionContextHistory.closeActive(relativeNow())
    }

    if (hasSession && (!hadSession || sessionIdChanged)) {
      // New session appeared
      sessionContextHistory.add(buildSessionContext(newState), relativeNow())
      renewObservable.notify()
    } else if (hadSession && hasSession && !sessionIdChanged) {
      // Same session, check for property changes
      sessionStateUpdateObservable.notify({ previousState, newState })
      // Mutate the session context in the history for replay forced changes
      const currentContext = sessionContextHistory.find()
      if (currentContext) {
        currentContext.isReplayForced = !!newState.forcedReplay
      }
    }
  }

  function expire() {
    cancelExpandOrRenew()
    // Update in-memory state synchronously so events stop being collected immediately
    const expiredState = getExpiredSessionState(previousState, configuration)
    if (!trackingConsentState.isGranted()) {
      delete expiredState.anonymousId
    }
    handleStateChange(expiredState)
    previousState = expiredState
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

export function startSessionManagerStub(onReady: (sessionManager: SessionManager) => void): void {
  const stubSessionId = generateUUID()
  let sessionContext: SessionContext = {
    id: stubSessionId,
    isReplayForced: false,
    anonymousId: undefined,
  }
  onReady({
    findSession: () => sessionContext,
    findTrackedSession: () => sessionContext,
    renewObservable: new Observable(),
    expireObservable: new Observable(),
    sessionStateUpdateObservable: new Observable(),
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
