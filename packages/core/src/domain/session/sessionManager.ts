import { Observable } from '../../tools/observable'
import { createValueHistory } from '../../tools/valueHistory'
import type { RelativeTime } from '../../tools/utils/timeUtils'
import { clocksOrigin, dateNow, ONE_MINUTE, ONE_SECOND, relativeNow } from '../../tools/utils/timeUtils'
import { addEventListener, addEventListeners, DOM_EVENT } from '../../browser/addEventListener'
import { clearInterval, setInterval } from '../../tools/timer'
import { noop, throttle } from '../../tools/utils/functionUtils'
import { generateUUID } from '../../tools/utils/stringUtils'
import type { Configuration, InitConfiguration } from '../configuration'
import type { TrackingConsentState } from '../trackingConsent'
import { isWorkerEnvironment } from '../../tools/globalObject'
import { display } from '../../tools/display'
import { isSampled } from '../sampler'
import { SESSION_TIME_OUT_DELAY, SessionPersistence } from './sessionConstants'
import type { SessionState } from './sessionState'
import {
  expandSessionState,
  getExpiredSessionState,
  isSessionInExpiredState,
  isSessionInNotStartedState,
} from './sessionState'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './storeStrategies/sessionStoreStrategy'
import { selectCookieStrategy, initCookieStrategy } from './storeStrategies/sessionInCookie'
import { selectLocalStorageStrategy, initLocalStorageStrategy } from './storeStrategies/sessionInLocalStorage'
import { selectMemorySessionStoreStrategy, initMemorySessionStoreStrategy } from './storeStrategies/sessionInMemory'

export interface SessionManager {
  findSession: (startTime?: RelativeTime, options?: { returnInactive: boolean }) => SessionContext | undefined
  findTrackedSession: (startTime?: RelativeTime, options?: { returnInactive: boolean }) => SessionContext | undefined
  renewObservable: Observable<void>
  expireObservable: Observable<void>
  sessionStateUpdateObservable: Observable<{ previousState: SessionState; newState: SessionState }>
  expire: () => void
  updateSessionState: (state: Partial<SessionState>) => void
  stop: () => void
}

export interface SessionContext {
  id: string
  anonymousId?: string | undefined
  isReplayForced?: boolean
}

export const VISIBILITY_CHECK_DELAY = ONE_MINUTE
const SESSION_CONTEXT_TIMEOUT_DELAY = SESSION_TIME_OUT_DELAY
let stopCallbacks: Array<() => void> = []

/**
 * Selects the correct session store strategy type based on the configuration and storage
 * availability. When an array is provided, tries each persistence type in order until one
 * successfully initializes.
 */
export function selectSessionStoreStrategyType(
  initConfiguration: InitConfiguration
): SessionStoreStrategyType | undefined {
  const persistenceList = normalizePersistenceList(initConfiguration.sessionPersistence, initConfiguration)

  for (const persistence of persistenceList) {
    const strategyType = selectStrategyForPersistence(persistence, initConfiguration)
    if (strategyType !== undefined) {
      return strategyType
    }
  }

  return undefined
}

function normalizePersistenceList(
  sessionPersistence: SessionPersistence | SessionPersistence[] | undefined,
  initConfiguration: InitConfiguration
): SessionPersistence[] {
  if (Array.isArray(sessionPersistence)) {
    return sessionPersistence
  }

  if (sessionPersistence !== undefined) {
    return [sessionPersistence]
  }

  // In worker environments, default to memory since cookie and localStorage are not available
  // TODO: make it work when we start using Cookie Store API
  // @see https://developer.mozilla.org/en-US/docs/Web/API/CookieStore
  if (isWorkerEnvironment) {
    return [SessionPersistence.MEMORY]
  }

  // Legacy default behavior: cookie first, with optional localStorage fallback
  return initConfiguration.allowFallbackToLocalStorage
    ? [SessionPersistence.COOKIE, SessionPersistence.LOCAL_STORAGE]
    : [SessionPersistence.COOKIE]
}

function selectStrategyForPersistence(
  persistence: SessionPersistence,
  initConfiguration: InitConfiguration
): SessionStoreStrategyType | undefined {
  switch (persistence) {
    case SessionPersistence.COOKIE:
      return selectCookieStrategy(initConfiguration)

    case SessionPersistence.LOCAL_STORAGE:
      return selectLocalStorageStrategy()

    case SessionPersistence.MEMORY:
      return selectMemorySessionStoreStrategy()

    default:
      display.error(`Invalid session persistence '${String(persistence)}'`)
      return undefined
  }
}

function getSessionStoreStrategy(
  strategyType: SessionStoreStrategyType,
  configuration: Configuration
): SessionStoreStrategy {
  switch (strategyType.type) {
    case SessionPersistence.COOKIE:
      return initCookieStrategy(strategyType.cookieOptions, !!configuration.trackAnonymousUser)
    case SessionPersistence.LOCAL_STORAGE:
      return initLocalStorageStrategy()
    case SessionPersistence.MEMORY:
      return initMemorySessionStoreStrategy()
  }
}

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

  const strategy = getSessionStoreStrategy(configuration.sessionStoreStrategyType, configuration)

  const sessionContextHistory = createValueHistory<SessionContext>({
    expireDelay: SESSION_CONTEXT_TIMEOUT_DELAY,
  })
  stopCallbacks.push(() => sessionContextHistory.stop())

  let previousState: SessionState = {}
  let isFirstEmission = true

  const { throttled: throttledExpandOrRenew, cancel: cancelExpandOrRenew } = throttle(
    () => {
      strategy.setSessionState((state) => expandOrRenew(state, configuration))
    },
    ONE_SECOND
  )
  stopCallbacks.push(cancelExpandOrRenew)

  // Subscribe to all state changes from the strategy
  const subscription = strategy.sessionObservable.subscribe((newState) => {
    if (isSessionInExpiredState(newState)) {
      newState = getExpiredSessionState(newState, configuration)
    }

    if (isFirstEmission) {
      isFirstEmission = false
      handleFirstEmission(newState)
    } else {
      handleSubsequentEmission(newState)
    }

    previousState = newState
  })
  stopCallbacks.push(() => subscription.unsubscribe())

  // Trigger the first emission by initializing the session
  strategy.setSessionState((state) => initializeSession(state, configuration))

  function handleFirstEmission(newState: SessionState) {
    // Tracking consent is always granted when the session manager is started, but it may be revoked
    // during the async initialization (e.g., while waiting for cookie lock). We check
    // consent status in the callback to handle this case.
    if (!trackingConsentState.isGranted()) {
      expire()
      return
    }

    sessionContextHistory.add(buildSessionContext(newState), clocksOrigin().relative)

    trackingConsentState.observable.subscribe(() => {
      if (trackingConsentState.isGranted()) {
        strategy.setSessionState((state) => expandOrRenew(state, configuration))
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
        strategy.setSessionState((state) => expandOnly(state))
      })
      trackResume(configuration, () => {
        strategy.setSessionState((state) => initializeSession(state, configuration))
      })
    }

    onReady({
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
        strategy.setSessionState((state) => ({ ...state, ...partialState }))
      },
      stop: () => {
        // Individual stop handled by stopSessionManager
      },
    })
  }

  function handleSubsequentEmission(newState: SessionState) {
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
    strategy.setSessionState((state) => {
      if (!trackingConsentState.isGranted()) {
        delete state.anonymousId
      }
      return getExpiredSessionState(state, configuration)
    })
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
    stop: noop,
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
