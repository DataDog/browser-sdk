import { isChromium } from '../../../tools/utils/browserDetection'
import type { CookieOptions } from '../../../browser/cookie'
import { getCurrentSite, areCookiesAuthorized, deleteCookie, getCookie, setCookie } from '../../../browser/cookie'
import type { InitConfiguration } from '../../configuration'
import { tryOldCookiesMigration } from '../oldCookiesMigration'
import { SESSION_EXPIRATION_DELAY } from '../sessionConstants'
import type { SessionState } from '../sessionState'
import { toSessionString, toSessionState } from '../sessionState'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './sessionStoreStrategy'
import { SESSION_STORE_KEY } from './sessionStoreStrategy'

export function selectCookieStrategy(initConfiguration: InitConfiguration): SessionStoreStrategyType | undefined {
  const cookieOptions = buildCookieOptions(initConfiguration)
  return areCookiesAuthorized(cookieOptions) ? { type: 'Cookie', cookieOptions } : undefined
}

export function initCookieStrategy(cookieOptions: CookieOptions): SessionStoreStrategy {
  const cookieStore = {
    /**
     * Lock strategy allows mitigating issues due to concurrent access to cookie.
     * This issue concerns only chromium browsers and enabling this on firefox increases cookie write failures.
     */
    isLockEnabled: isChromium(),
    persistSession: persistSessionCookie(cookieOptions),
    retrieveSession: retrieveSessionCookie,
    clearSession: deleteSessionCookie(cookieOptions),
  }

  tryOldCookiesMigration(cookieStore)

  return cookieStore
}

function persistSessionCookie(options: CookieOptions) {
  return (session: SessionState) => {
    setCookie(SESSION_STORE_KEY, toSessionString(session), SESSION_EXPIRATION_DELAY, options)
  }
}

function retrieveSessionCookie(): SessionState {
  const sessionString = getCookie(SESSION_STORE_KEY)
  return toSessionState(sessionString)
}

function deleteSessionCookie(options: CookieOptions) {
  return () => {
    deleteCookie(SESSION_STORE_KEY, options)
  }
}

export function buildCookieOptions(initConfiguration: InitConfiguration) {
  const cookieOptions: CookieOptions = {}

  cookieOptions.secure =
    !!initConfiguration.useSecureSessionCookie ||
    !!initConfiguration.usePartitionedCrossSiteSessionCookie ||
    !!initConfiguration.useCrossSiteSessionCookie
  cookieOptions.crossSite =
    !!initConfiguration.usePartitionedCrossSiteSessionCookie || !!initConfiguration.useCrossSiteSessionCookie
  cookieOptions.partitioned = !!initConfiguration.usePartitionedCrossSiteSessionCookie

  if (initConfiguration.trackSessionAcrossSubdomains) {
    cookieOptions.domain = getCurrentSite()
  }

  return cookieOptions
}
