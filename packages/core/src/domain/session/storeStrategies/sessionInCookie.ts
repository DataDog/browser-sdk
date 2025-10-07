import { isEmptyObject } from '../../../tools/utils/objectUtils'
import { isChromium } from '../../../tools/utils/browserDetection'
import type { CookieOptions } from '../../../browser/cookie'
import { getCurrentSite, areCookiesAuthorized, getCookies, setCookie } from '../../../browser/cookie'
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
    retrieveSession: () => retrieveSessionCookie(configuration, cookieOptions),
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
  setCookie(
    SESSION_STORE_KEY,
    toSessionString({
      ...sessionState,
      // deleting a cookie is writing a new cookie with an empty value
      // we don't want to store the cookie options in this case otherwise the cookie will not be deleted
      ...(!isEmptyObject(sessionState) ? { c: encodeCookieOptions(configuration, options) } : {}),
    }),
    configuration.trackAnonymousUser ? SESSION_COOKIE_EXPIRATION_DELAY : defaultTimeout,
    options
  )
}

function encodeCookieOptions(configuration: Configuration, cookieOptions: CookieOptions): string {
  const domainCount = cookieOptions.domain ? cookieOptions.domain.split('.').length - 1 : 0

  /* eslint-disable no-bitwise */
  let byte = 0
  byte |= SESSION_COOKIE_VERSION << 6 // Store version in upper 2 bits
  byte |= domainCount << 2 // Store domain count in next 4 bits
  byte |= configuration.usePartitionedCrossSiteSessionCookie ? 1 : 0 << 1 // Store useCrossSiteScripting in next bit
  // there is one bit left for future use
  /* eslint-enable no-bitwise */

  return byte.toString(16) // Convert to hex string
}

/**
 * Retrieve the session state from the cookie that was set with the same cookie options
 * If there is no match, return the first cookie, because that's how `getCookie()` works
 */
export function retrieveSessionCookie(configuration: Configuration, cookieOptions: CookieOptions): SessionState {
  const cookies = getCookies(SESSION_STORE_KEY) ?? []
  const opts = encodeCookieOptions(configuration, cookieOptions)

  let sessionState: SessionState | undefined

  // reverse the cookies so that if there is no match, the cookie returned is the first one
  for (const cookie of cookies.reverse()) {
    sessionState = toSessionState(cookie)

    if (sessionState.c === opts) {
      break
    }
  }

  // remove the cookie options from the session state
  delete sessionState?.c

  return sessionState ?? {}
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
