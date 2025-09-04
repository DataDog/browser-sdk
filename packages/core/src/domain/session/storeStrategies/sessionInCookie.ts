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
import type { CookieStore } from '../../../browser/browser.types'
import type { SessionStoreStrategy, SessionStoreStrategyType } from './sessionStoreStrategy'
import { SESSION_STORE_KEY } from './sessionStoreStrategy'

export function selectCookieStrategy(initConfiguration: InitConfiguration): SessionStoreStrategyType | undefined {
  const cookieOptions = buildCookieOptions(initConfiguration)
  return areCookiesAuthorized(cookieOptions) ? { type: SessionPersistence.COOKIE, cookieOptions } : undefined
}

export interface CookieStoreWindow {
  cookieStore: CookieStore
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
    AsyncPersistSession: (sessionState: SessionState) =>
      AsyncStoreSessionCookie(cookieOptions, configuration, sessionState, SESSION_EXPIRATION_DELAY),
    AsyncRetrieveSession: () => AsyncRetrieveSessionCookie(),
    AsyncExpireSession: (sessionState: SessionState) =>
      AsyncStoreSessionCookie(
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

function AsyncStoreSessionCookie(
  options: CookieOptions,
  configuration: Configuration,
  sessionState: SessionState,
  defaultTimeout: number
): Promise<void> {
  if ('cookieStore' in window) {
    const expireDelay = configuration.trackAnonymousUser ? SESSION_COOKIE_EXPIRATION_DELAY : defaultTimeout

    return (window as CookieStoreWindow).cookieStore.set({
      name: SESSION_STORE_KEY,
      value: toSessionString(sessionState),
      expires: new Date().getTime() + expireDelay,
      secure: options.secure,
      domain: options.domain,
      sameSite: options.crossSite ? 'none' : 'strict',
    })
  }

  return new Promise((resolve) => resolve(storeSessionCookie(options, configuration, sessionState, defaultTimeout)))
}

export function retrieveSessionCookie(): SessionState {
  const sessionString = getCookie(SESSION_STORE_KEY)
  const sessionState = toSessionState(sessionString)
  return sessionState
}

export function AsyncRetrieveSessionCookie(): Promise<SessionState> {
  if ('cookieStore' in window) {
    return (window as CookieStoreWindow).cookieStore
      .get(SESSION_STORE_KEY)
      .then((cookie) => toSessionState(cookie?.value))
  }

  return new Promise((resolve) => resolve(retrieveSessionCookie()))
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
