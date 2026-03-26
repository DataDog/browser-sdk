import { isEmptyObject } from '../../../tools/utils/objectUtils'
import type { CookieOptions } from '../../../browser/cookie'
import { getCurrentSite, areCookiesAuthorized } from '../../../browser/cookie'
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
import { createCookieAccess } from '../../../browser/cookieAccess'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './sessionStoreStrategy'
import { SESSION_STORE_KEY } from './sessionStoreStrategy'

const SESSION_COOKIE_VERSION = 0

export function selectCookieStrategy(initConfiguration: InitConfiguration): SessionStoreStrategyType | undefined {
  const cookieOptions = buildCookieOptions(initConfiguration)
  return cookieOptions && areCookiesAuthorized(cookieOptions)
    ? { type: SessionPersistence.COOKIE, cookieOptions }
    : undefined
}

// Promise chain serializes calls when Web Locks are unavailable
// eslint-disable-next-line local-rules/disallow-side-effects
let pendingChain = Promise.resolve()

export function initCookieStrategy(cookieOptions: CookieOptions, configuration: Configuration): SessionStoreStrategy {
  const sessionObservable = new Observable<SessionState>()

  const cookieAccess = createCookieAccess(SESSION_STORE_KEY, configuration, cookieOptions)
  const trackAnonymousUser = !!configuration.trackAnonymousUser
  const opts = encodeCookieOptions(cookieOptions)

  cookieAccess.observable.subscribe((cookieValue) => {
    const state = toSessionState(cookieValue ?? '')
    // Ignore updates from non-matching cookies (e.g. partitioned vs non-partitioned)
    if (state.c && state.c !== opts) {
      return
    }
    delete state.c
    sessionObservable.notify(state)
  })

  function applyAndWrite(fn: (state: SessionState) => SessionState) {
    return cookieAccess.getAllAndSet((cookieValues) => {
      const currentState = findMatchingSessionState(cookieValues, opts)
      const newState = fn(currentState)
      const sessionString = buildSessionString(newState, cookieOptions)
      const expireDelay = computeExpireDelay(trackAnonymousUser, newState)

      return { value: sessionString, expireDelay }
    })
  }

  return {
    async setSessionState(fn: (sessionState: SessionState) => SessionState): Promise<void> {
      if (typeof navigator !== 'undefined' && navigator.locks) {
        await navigator.locks.request(SESSION_STORE_KEY, () => applyAndWrite(fn))
      } else {
        pendingChain = pendingChain.then(() => applyAndWrite(fn))
        await pendingChain
      }
    },
    sessionObservable,
  }
}

function findMatchingSessionState(items: string[], opts: string): SessionState {
  let sessionState: SessionState | undefined

  // reverse the cookies so that if there is no match, the cookie returned is the first one
  for (const item of items.slice().reverse()) {
    sessionState = toSessionState(item)
    if (sessionState.c === opts) {
      break
    }
  }

  // remove the cookie options from the session state as this is not part of the session state
  delete sessionState?.c

  return sessionState ?? {}
}

function computeExpireDelay(trackAnonymousUser: boolean, sessionState: SessionState): number {
  // Cookie expiration logic:
  // - trackAnonymousUser=true: always use 1 year (keep cookie alive for device ID)
  // - trackAnonymousUser=false + active session: 15 min (activity-based renewal)
  // - trackAnonymousUser=false + expired session: 4h (absolute timeout)
  return trackAnonymousUser
    ? SESSION_COOKIE_EXPIRATION_DELAY
    : sessionState.isExpired
      ? SESSION_TIME_OUT_DELAY
      : SESSION_EXPIRATION_DELAY
}

function buildSessionString(sessionState: SessionState, cookieOptions: CookieOptions): string {
  return toSessionString(
    isEmptyObject(sessionState) ? sessionState : { ...sessionState, c: encodeCookieOptions(cookieOptions) }
  )
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
  byte |= SESSION_COOKIE_VERSION << 5 // Store version in upper 3 bits
  byte |= domainCount << 1 // Store domain count in next 4 bits
  byte |= cookieOptions.crossSite ? 1 : 0 // Store useCrossSiteScripting in next bit
  /* eslint-enable no-bitwise */

  return byte.toString(16) // Convert to hex string
}
