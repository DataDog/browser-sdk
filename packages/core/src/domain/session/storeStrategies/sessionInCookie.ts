import { isEmptyObject } from '../../../tools/utils/objectUtils'
import type { CookieOptions } from '../../../browser/cookie'
import { getCurrentSite, areCookiesAuthorized, getCookies } from '../../../browser/cookie'
import type { CookieAccessor } from '../../../browser/cookieAccess'
import { createCookieAccessor } from '../../../browser/cookieAccess'
import type { CookieStoreWindow } from '../../../browser/cookieObservable'
import { createCookieObservable } from '../../../browser/cookieObservable'
import { setInterval, clearInterval } from '../../../tools/timer'
import { ONE_SECOND } from '../../../tools/utils/timeUtils'
import type { InitConfiguration, Configuration } from '../../configuration'
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
  const cookieAccessor = createCookieAccessor(cookieOptions)

  return {
    persistSession: (sessionState: SessionState) =>
      storeSessionCookie(cookieAccessor, cookieOptions, configuration, sessionState, SESSION_EXPIRATION_DELAY),
    retrieveSession: () => retrieveSessionCookie(cookieAccessor, cookieOptions),
    expireSession: (sessionState: SessionState) =>
      storeSessionCookie(
        cookieAccessor,
        cookieOptions,
        configuration,
        getExpiredSessionState(sessionState, configuration),
        SESSION_TIME_OUT_DELAY
      ),
    onExternalChange: (callback) => {
      // Use CookieStore change events when available for instant, efficient notifications.
      // Fall back to periodic polling (like the old code) when CookieStore is not supported.
      if ((window as CookieStoreWindow).cookieStore) {
        const observable = createCookieObservable(configuration, SESSION_STORE_KEY)
        const { unsubscribe } = observable.subscribe(callback)
        return unsubscribe
      }
      const intervalId = setInterval(callback, ONE_SECOND)
      return () => clearInterval(intervalId)
    },
  }
}

async function storeSessionCookie(
  cookieAccessor: CookieAccessor,
  cookieOptions: CookieOptions,
  configuration: Configuration,
  sessionState: SessionState,
  defaultTimeout: number
) {
  const sessionStateString = toSessionString({
    ...sessionState,
    // deleting a cookie is writing a new cookie with an empty value
    // we don't want to store the cookie options in this case otherwise the cookie will not be deleted
    ...(!isEmptyObject(sessionState) ? { c: encodeCookieOptions(cookieOptions) } : {}),
  })

  await cookieAccessor.set(
    SESSION_STORE_KEY,
    sessionStateString,
    configuration.trackAnonymousUser ? SESSION_COOKIE_EXPIRATION_DELAY : defaultTimeout,
    cookieOptions
  )
}

/**
 * Retrieve the session state from the cookie that was set with the same cookie options
 * If there is no match, return the first cookie, because that's how `getCookie()` works
 */
export async function retrieveSessionCookie(
  cookieAccessor: CookieAccessor,
  cookieOptions: CookieOptions
): Promise<SessionState> {
  const cookies = await cookieAccessor.getAll(SESSION_STORE_KEY)
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

/**
 * Retrieve the session state synchronously using document.cookie (for diagnostics only)
 */
export function retrieveSessionCookieSync(cookieOptions: CookieOptions): SessionState {
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
