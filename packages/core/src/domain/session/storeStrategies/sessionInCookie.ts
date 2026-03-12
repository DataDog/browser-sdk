import { isEmptyObject } from '../../../tools/utils/objectUtils'
import type { CookieOptions } from '../../../browser/cookie'
import { getCurrentSite, areCookiesAuthorized, getCookies, setCookie } from '../../../browser/cookie'
import type { InitConfiguration } from '../../configuration'
import {
  SESSION_COOKIE_EXPIRATION_DELAY,
  SESSION_EXPIRATION_DELAY,
  SESSION_TIME_OUT_DELAY,
  SessionPersistence,
} from '../sessionConstants'
import type { SessionState } from '../sessionState'
import { toSessionString, toSessionState } from '../sessionState'
import { Observable } from '../../../tools/observable'
import { setInterval } from '../../../tools/timer'
import { ONE_SECOND } from '../../../tools/utils/timeUtils'
import { monitor } from '../../../tools/monitor'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './sessionStoreStrategy'
import { SESSION_STORE_KEY } from './sessionStoreStrategy'

const SESSION_COOKIE_VERSION = 0
const BROADCAST_CHANNEL_NAME = '_dd_session'
const POLL_DELAY = ONE_SECOND

export function selectCookieStrategy(initConfiguration: InitConfiguration): SessionStoreStrategyType | undefined {
  const cookieOptions = buildCookieOptions(initConfiguration)
  return cookieOptions && areCookiesAuthorized(cookieOptions)
    ? { type: SessionPersistence.COOKIE, cookieOptions }
    : undefined
}

export function initCookieStrategy(cookieOptions: CookieOptions, trackAnonymousUser: boolean): SessionStoreStrategy {
  const sessionObservable = new Observable<SessionState>()
  const queue: Array<(sessionState: SessionState) => SessionState> = []
  let isProcessing = false

  // Cross-tab notification: BroadcastChannel (preferred) or polling (fallback)
  let broadcastChannel: BroadcastChannel | undefined
  let lastEmittedSessionString: string | undefined

  try {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
    broadcastChannel.onmessage = monitor(() => {
      const state = readAndStripCookieOptions(cookieOptions)
      const sessionString = toSessionString(state)
      if (sessionString !== lastEmittedSessionString) {
        lastEmittedSessionString = sessionString
        sessionObservable.notify(state)
      }
    })
  } catch {
    // BroadcastChannel not available, fall back to polling
    setInterval(() => {
      const state = readAndStripCookieOptions(cookieOptions)
      const sessionString = toSessionString(state)
      if (sessionString !== lastEmittedSessionString) {
        lastEmittedSessionString = sessionString
        sessionObservable.notify(state)
      }
    }, POLL_DELAY)
  }

  function applyAndEmit(fn: (state: SessionState) => SessionState) {
    const currentState = readAndStripCookieOptions(cookieOptions)
    const newState = fn(currentState)
    writeCookie(cookieOptions, trackAnonymousUser, newState)

    const strippedState = { ...newState }
    delete strippedState.c
    lastEmittedSessionString = toSessionString(strippedState)
    sessionObservable.notify(strippedState)
    broadcastChannel?.postMessage(null)
  }

  function processQueue() {
    if (isProcessing || queue.length === 0) {
      return
    }
    isProcessing = true

    if (typeof navigator !== 'undefined' && navigator.locks) {
      navigator.locks.request(SESSION_STORE_KEY, () => {
        // Process entire queue inside the lock for atomicity
        while (queue.length > 0) {
          applyAndEmit(queue.shift()!)
        }
        isProcessing = false
      })
    } else {
      // No Web Locks available — process synchronously (last-write-wins)
      while (queue.length > 0) {
        applyAndEmit(queue.shift()!)
      }
      isProcessing = false
    }
  }

  return {
    setSessionState(fn: (sessionState: SessionState) => SessionState): void {
      queue.push(fn)
      processQueue()
    },
    sessionObservable,
  }
}

function readAndStripCookieOptions(cookieOptions: CookieOptions): SessionState {
  const cookies = getCookies(SESSION_STORE_KEY)
  const opts = encodeCookieOptions(cookieOptions)

  let sessionState: SessionState | undefined

  for (const cookie of cookies.reverse()) {
    sessionState = toSessionState(cookie)
    if (sessionState.c === opts) {
      break
    }
  }

  delete sessionState?.c
  return sessionState ?? {}
}

function writeCookie(cookieOptions: CookieOptions, trackAnonymousUser: boolean, sessionState: SessionState) {
  const sessionStateWithOptions = {
    ...sessionState,
    ...(!isEmptyObject(sessionState) ? { c: encodeCookieOptions(cookieOptions) } : {}),
  }
  const sessionString = toSessionString(sessionStateWithOptions)

  // Cookie expiration logic:
  // - trackAnonymousUser=true: always use 1 year (keep cookie alive for device ID)
  // - trackAnonymousUser=false + active session: 15 min (activity-based renewal)
  // - trackAnonymousUser=false + expired session: 4h (absolute timeout)
  const expireDelay = trackAnonymousUser
    ? SESSION_COOKIE_EXPIRATION_DELAY
    : sessionState.isExpired
      ? SESSION_TIME_OUT_DELAY
      : SESSION_EXPIRATION_DELAY

  setCookie(SESSION_STORE_KEY, sessionString, expireDelay, cookieOptions)
}

export function buildCookieOptions(initConfiguration: InitConfiguration): CookieOptions | undefined {
  const cookieOptions: CookieOptions = {}

  cookieOptions.secure =
    !!initConfiguration.useSecureSessionCookie || !!initConfiguration.usePartitionedCrossSiteSessionCookie
  cookieOptions.crossSite = !!initConfiguration.usePartitionedCrossSiteSessionCookie
  cookieOptions.partitioned = !!initConfiguration.usePartitionedCrossSiteSessionCookie

  if (initConfiguration.trackSessionAcrossSubdomains) {
    const currentSite = getCurrentSite()
    if (!currentSite) {
      return
    }
    cookieOptions.domain = currentSite
  }

  return cookieOptions
}

function encodeCookieOptions(cookieOptions: CookieOptions): string {
  const domainCount = cookieOptions.domain ? cookieOptions.domain.split('.').length - 1 : 0

  /* eslint-disable no-bitwise */
  let byte = 0
  byte |= SESSION_COOKIE_VERSION << 5
  byte |= domainCount << 1
  byte |= cookieOptions.crossSite ? 1 : 0
  /* eslint-enable no-bitwise */

  return byte.toString(16)
}
