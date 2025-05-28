import { isChromium } from '../../../tools/utils/browserDetection'
import type { CookieOptions } from '../../../browser/cookie'
import { getCurrentSite, areCookiesAuthorized, getCookie, setCookie } from '../../../browser/cookie'
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

export function selectCookieStrategy(initConfiguration: InitConfiguration): SessionStoreStrategyType | undefined {
  const cookieOptions = buildCookieOptions(initConfiguration)
  return areCookiesAuthorized(cookieOptions) ? { type: SessionPersistence.COOKIE, cookieOptions } : undefined
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
    retrieveSession: retrieveSessionCookie,
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
    toSessionString(sessionState),
    configuration.trackAnonymousUser ? SESSION_COOKIE_EXPIRATION_DELAY : defaultTimeout,
    options
  )
}

function retrieveSessionCookie(): SessionState {
  const sessionString = getCookie(SESSION_STORE_KEY)
  const sessionState = toSessionState(sessionString)
  return sessionState
}

export function buildCookieOptions(initConfiguration: InitConfiguration) {
  const cookieOptions: CookieOptions = {}

  cookieOptions.secure =
    !!initConfiguration.useSecureSessionCookie || !!initConfiguration.usePartitionedCrossSiteSessionCookie
  cookieOptions.crossSite = !!initConfiguration.usePartitionedCrossSiteSessionCookie
  cookieOptions.partitioned = !!initConfiguration.usePartitionedCrossSiteSessionCookie

  if (initConfiguration.trackSessionAcrossSubdomains) {
    cookieOptions.domain = getCurrentSite()
  }

  return cookieOptions
}
