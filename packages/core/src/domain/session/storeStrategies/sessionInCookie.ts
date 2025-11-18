import { isEmptyObject } from '../../../tools/utils/objectUtils'
import { isChromium } from '../../../tools/utils/browserDetection'
import type { CookieOptions } from '../../../browser/cookie'
import { getCurrentSite, areCookiesAuthorized, getCookies, setCookie, getCookie } from '../../../browser/cookie'
import type { InitConfiguration, Configuration } from '../../configuration'
import { tryOldCookiesMigration } from '../oldCookiesMigration'
import {
  SESSION_COOKIE_EXPIRATION_DELAY,
  SESSION_EXPIRATION_DELAY,
  SESSION_TIME_OUT_DELAY,
  SessionPersistence,
} from '../sessionConstants'
import type { SessionState } from '../sessionState'
import { toSessionString, toSessionState, getExpiredSessionState } from '../sessionState'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './sessionStoreStrategy'
import { SESSION_STORE_KEY } from './sessionStoreStrategy'

const SESSION_COOKIE_VERSION = 0

export function selectCookieStrategy(initConfiguration: InitConfiguration): SessionStoreStrategyType | undefined {
  const cookieOptions = buildCookieOptions(initConfiguration)
  return cookieOptions && areCookiesAuthorized(cookieOptions)
    ? { type: SessionPersistence.COOKIE, cookieOptions }
    : undefined
}

export function initCookieStrategy(configuration: Configuration, cookieOptions: CookieOptions): SessionStoreStrategy {
  const cookieStore = {
    /**
     * Lock strategy allows mitigating issues due to concurrent access to cookie.
     * This issue concerns only chromium browsers and enabling this on firefox increases cookie write failures.
     */
    isLockEnabled: isChromium(),
    persistSession: (sessionState: SessionState) =>
      storeSessionCookie(cookieOptions, configuration, sessionState, SESSION_EXPIRATION_DELAY),
    retrieveSession: () => retrieveSessionCookie(cookieOptions, configuration),
    expireSession: (sessionState: SessionState) =>
      storeSessionCookie(
        cookieOptions,
        configuration,
        getExpiredSessionState(sessionState, configuration),
        SESSION_TIME_OUT_DELAY
      ),
  }

  tryOldCookiesMigration(cookieStore)

  return cookieStore
}

function storeSessionCookie(
  options: CookieOptions,
  configuration: Configuration,
  sessionState: SessionState,
  defaultTimeout: number
) {
  let sessionStateString = toSessionString(sessionState)

  if (configuration.betaEncodeCookieOptions) {
    sessionStateString = toSessionString({
      ...sessionState,
      // deleting a cookie is writing a new cookie with an empty value
      // we don't want to store the cookie options in this case otherwise the cookie will not be deleted
      ...(!isEmptyObject(sessionState) ? { c: encodeCookieOptions(options) } : {}),
    })
  }

  setCookie(
    SESSION_STORE_KEY,
    sessionStateString,
    configuration.trackAnonymousUser ? SESSION_COOKIE_EXPIRATION_DELAY : defaultTimeout,
    options
  )
}

/**
 * Retrieve the session state from the cookie that was set with the same cookie options
 * If there is no match, return the first cookie, because that's how `getCookie()` works
 */
export function retrieveSessionCookie(cookieOptions: CookieOptions, configuration: Configuration): SessionState {
  if (configuration.betaEncodeCookieOptions) {
    return retrieveSessionCookieFromEncodedCookie(cookieOptions)
  }

  const sessionString = getCookie(SESSION_STORE_KEY)
  const sessionState = toSessionState(sessionString)
  return sessionState
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

/**
 * Retrieve the session state from the cookie that was set with the same cookie options.
 * If there is no match, fallback to the first cookie, (because that's how `getCookie()` works)
 * and this allows to keep the current session id when we release this feature.
 */
function retrieveSessionCookieFromEncodedCookie(cookieOptions: CookieOptions): SessionState {
  const cookies = getCookies(SESSION_STORE_KEY)
  const opts = encodeCookieOptions(cookieOptions)

  let sessionState: SessionState | undefined

  // reverse the cookies so that if there is no match, the cookie returned is the first one
  for (const cookie of cookies.reverse()) {
    sessionState = toSessionState(cookie)

    if (sessionState.c === opts) {
      break
    }
  }

  // remove the cookie options from the session state as this is not part of the session state
  delete sessionState?.c

  return sessionState ?? {}
}
