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
  createNewSessionState,
  expandSessionState,
  createExpiredSessionState,
  isSessionInExpiredState,
  isSessionInNotStartedState,
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

// The order of this enum reflects the priority of operations: higher values take precedence when
// multiple operations are scheduled before the storage write occurs.
const enum OperationType {
  // Extend the session expiry if already active (e.g. page still visible)
  ExpandOnly,
  // Extend the session expiry, or create a new session if expired (e.g. user activity)
  ExpandOrRenew,
  // Transition to expired state if the session has timed out (e.g. expiration timer fires or browser resumes)
  SoftExpire,
  // Force the session into expired state regardless of current state (e.g. consent revoked)
  ForceExpire,
}

export function startSessionManager(
  configuration: Configuration,
  trackingConsentState: TrackingConsentState,
  onReady: (sessionManager: SessionManager) => void
) {
  const renewObservable = new Observable<SessionRenewalEvent>()
  const expireObservable = new Observable<void>()
  let expireContext: SessionDebugContext | undefined
  let scheduledOperation: { type: OperationType; sessionId: string | undefined } | undefined

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
    scheduleOperation(OperationType.ExpandOrRenew)
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

    sessionContextHistory.add(buildSessionContext(initialState), clocksOrigin().relative)
    scheduleExpirationTimeout(initialState)
    subscribeToSessionChanges()
    setupSessionTracking()
    onReady(buildSessionManager())
  })().catch(monitorError)

  async function resolveInitialState() {
    let state: SessionState = {}
    await strategy.setSessionState((currentState) => {
      if (isSessionInExpiredState(currentState) || !currentState.id) {
        state = createNewSessionState(state, configuration)
      } else {
        state = currentState
      }
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

  let expirationTimeoutId: ReturnType<typeof setTimeout> | undefined

  function scheduleExpirationTimeout(state: SessionState) {
    clearTimeout(expirationTimeoutId)
    if (state.expire) {
      const delay = Number(state.expire) - dateNow()
      expirationTimeoutId = setTimeout(() => {
        scheduleOperation(OperationType.SoftExpire)
      }, delay)
    }
  }
  stopCallbacks.push(() => clearTimeout(expirationTimeoutId))

  function setupSessionTracking() {
    trackingConsentState.observable.subscribe(() => {
      if (trackingConsentState.isGranted()) {
        scheduleOperation(OperationType.ExpandOrRenew)
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
        scheduleOperation(OperationType.ExpandOnly)
      })
      trackResume(configuration, () => {
        scheduleOperation(OperationType.SoftExpire)
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
    // Persist to storage asynchronously
    scheduleOperation(OperationType.ForceExpire)
    // Update in-memory state synchronously so events stop being collected immediately
    if (sessionContextHistory.find()) {
      expireObservable.notify()
      sessionContextHistory.closeActive(relativeNow())
    }
  }

  function scheduleOperation(type: OperationType) {
    const hadOperationScheduled = !!scheduledOperation
    if (!scheduledOperation || type >= scheduledOperation.type) {
      scheduledOperation = { type, sessionId: sessionContextHistory.find()?.id }
    }

    if (!hadOperationScheduled) {
      strategy
        .setSessionState((state) => {
          const operation = scheduledOperation!
          scheduledOperation = undefined

          if (state.id !== operation.sessionId) {
            return state
          }

          // prevent renewing if state is altered by a 3rd party (e.g. adblocker deleting the cookie)
          if (isSessionInNotStartedState(state)) {
            return state
          }

          switch (operation.type) {
            case OperationType.ExpandOnly:
              if (!isSessionInExpiredState(state)) {
                expandSessionState(state)
              }
              return state
            case OperationType.ExpandOrRenew:
              if (isSessionInExpiredState(state)) {
                return createNewSessionState(state, configuration)
              }
              return state
            case OperationType.SoftExpire:
              if (isSessionInExpiredState(state)) {
                return createExpiredSessionState(state, configuration, trackingConsentState)
              }
              return state
            case OperationType.ForceExpire:
              return createExpiredSessionState(state, configuration, trackingConsentState)
          }
        })
        .catch(monitorError)
    }
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
