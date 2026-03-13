import { isEmptyObject } from '../../../tools/utils/objectUtils'
import type { CookieOptions } from '../../../browser/cookie'
import { getCurrentSite, areCookiesAuthorized, getCookies, setCookie } from '../../../browser/cookie'
import type { Configuration, InitConfiguration } from '../../configuration'
import {
  SESSION_COOKIE_EXPIRATION_DELAY,
  SESSION_EXPIRATION_DELAY,
  SESSION_TIME_OUT_DELAY,
  SessionPersistence,
} from '../sessionConstants'
import type { SessionState } from '../sessionState'
import { toSessionString, toSessionState } from '../sessionState'
import { Observable } from '../../../tools/observable'
import { createCookieObservable } from '../../../browser/cookieObservable'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './sessionStoreStrategy'
import { SESSION_STORE_KEY } from './sessionStoreStrategy'

const SESSION_COOKIE_VERSION = 0

export function selectCookieStrategy(initConfiguration: InitConfiguration): SessionStoreStrategyType | undefined {
  const cookieOptions = buildCookieOptions(initConfiguration)
  return cookieOptions && areCookiesAuthorized(cookieOptions)
    ? { type: SessionPersistence.COOKIE, cookieOptions }
    : undefined
}

export function initCookieStrategy(cookieOptions: CookieOptions, configuration: Configuration): SessionStoreStrategy {
  const sessionObservable = new Observable<SessionState>()
  const queue: Array<(sessionState: SessionState) => SessionState> = []
  let isProcessing = false

  const cookieObservable = createCookieObservable(configuration, SESSION_STORE_KEY)
  cookieObservable.subscribe((cookieValue) => {
    const state = parseAndStripCookieOptions(cookieValue)
    sessionObservable.notify(state)
  })

  function applyAndWrite(fn: (state: SessionState) => SessionState) {
    const currentState = readAndStripCookieOptions(cookieOptions)
    const newState = fn(currentState)
    writeCookie(cookieOptions, !!configuration.trackAnonymousUser, newState)
  }

  function processQueue() {
    if (isProcessing || queue.length === 0) {
      return
    }
    isProcessing = true

    if (typeof navigator !== 'undefined' && navigator.locks) {
      void navigator.locks.request(SESSION_STORE_KEY, () => {
        // Process entire queue inside the lock for atomicity
        while (queue.length > 0) {
          applyAndWrite(queue.shift()!)
        }
        isProcessing = false
      })
    } else {
      // No Web Locks available — process synchronously (last-write-wins)
      while (queue.length > 0) {
        applyAndWrite(queue.shift()!)
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

function parseAndStripCookieOptions(cookieValue: string | undefined): SessionState {
  if (!cookieValue) {
    return {}
  }

  // The cookieObservable gives us the raw cookie value. When multiple cookies exist with the same
  // name (e.g. partitioned vs non-partitioned), document.cookie contains all of them but
  // cookieStore/polling only gives us one value. Parse what we get and strip cookie options.
  const state = toSessionState(cookieValue)
  delete state.c
  return state
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
