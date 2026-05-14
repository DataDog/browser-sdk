import { isEmptyObject } from '../../../tools/utils/objectUtils'
import type { CookieOptions } from '../../../browser/cookie'
import { getCurrentSite, getCookies } from '../../../browser/cookie'
import type { Configuration, InitConfiguration } from '../../configuration'
import { SESSION_COOKIE_EXPIRATION_DELAY, SESSION_TIME_OUT_DELAY, SessionPersistence } from '../sessionConstants'
import type { SessionState } from '../sessionState'
import { toSessionString, toSessionState } from '../sessionState'
import { Observable } from '../../../tools/observable'
import { mockable } from '../../../tools/mockable'
import { monitorError } from '../../../tools/monitor'
import type { CookieAccess } from '../../../browser/cookieAccess'
import {
  areCookiesAuthorized,
  createCookieStoreAccess,
  createDocumentCookieAccess,
} from '../../../browser/cookieAccess'
import type { CookieStoreWindow } from '../../../browser/browser.types'
import type {
  CookieSessionStoreStrategyType,
  SessionStoreStrategy,
  SessionStoreStrategyType,
  SessionObservableEvent,
} from './sessionStoreStrategy'
import { CookieApi, SESSION_STORE_KEY, LEGACY_SESSION_STORE_KEY } from './sessionStoreStrategy'

const SESSION_COOKIE_VERSION = 0

export async function selectCookieStrategy(
  configuration: Configuration
): Promise<SessionStoreStrategyType | undefined> {
  const { cookieOptions } = configuration
  if (!cookieOptions) {
    return undefined
  }

  if (
    mockable((window as CookieStoreWindow).cookieStore) &&
    (await areCookiesAuthorized(createCookieStoreAccess, cookieOptions, configuration))
  ) {
    return { type: SessionPersistence.COOKIE, cookieOptions, cookieApi: CookieApi.COOKIE_STORE }
  }

  if (await areCookiesAuthorized(createDocumentCookieAccess, cookieOptions, configuration)) {
    return { type: SessionPersistence.COOKIE, cookieOptions, cookieApi: CookieApi.DOCUMENT_COOKIE }
  }

  return undefined
}

// Promise chain serializes calls when Web Locks are unavailable
let pendingChain: Promise<void> | undefined

export function initCookieStrategy(
  sessionStoreStrategyType: CookieSessionStoreStrategyType,
  configuration: Configuration
): SessionStoreStrategy {
  const { cookieOptions, cookieApi } = sessionStoreStrategyType
  const sessionObservable = new Observable<SessionObservableEvent>()
  const trackAnonymousUser = !!configuration.trackAnonymousUser
  const opts = encodeCookieOptions(cookieOptions)
  const cookieAccess = mockable(createCookieAccess)(cookieApi, configuration, cookieOptions)
  let isFirstCall = true

  cookieAccess.observable.subscribe(() => {
    cookieAccess
      .getAll()
      .then((cookieValues) => {
        sessionObservable.notify({ cookieValues, sessionState: findMatchingSessionState(cookieValues, opts) })
      })
      .catch(monitorError)
  })

  function applyAndWrite(fn: (state: SessionState) => SessionState) {
    return cookieAccess.getAllAndSet((cookieValues) => {
      let currentState = findMatchingSessionState(cookieValues, opts)

      if (isFirstCall && isEmptyObject(currentState)) {
        currentState = findMatchingSessionState(getCookies(LEGACY_SESSION_STORE_KEY), opts)
      }
      isFirstCall = false

      const newState = fn(currentState)
      const sessionString = buildSessionString(newState, cookieOptions)
      const expireDelay = trackAnonymousUser ? SESSION_COOKIE_EXPIRATION_DELAY : SESSION_TIME_OUT_DELAY

      return { value: sessionString, expireDelay }
    })
  }

  return {
    async setSessionState(fn: (sessionState: SessionState) => SessionState): Promise<void> {
      if (typeof navigator !== 'undefined' && navigator.locks) {
        await navigator.locks.request(SESSION_STORE_KEY, () => applyAndWrite(fn))
      } else {
        pendingChain = (pendingChain ?? Promise.resolve()).then(() => applyAndWrite(fn))
        await pendingChain
      }
    },
    sessionObservable,
  }
}

export function createCookieAccess(
  cookieApi: CookieApi,
  configuration: Configuration,
  cookieOptions: CookieOptions
): CookieAccess {
  return cookieApi === CookieApi.COOKIE_STORE
    ? createCookieStoreAccess(SESSION_STORE_KEY, cookieOptions, configuration)
    : createDocumentCookieAccess(SESSION_STORE_KEY, cookieOptions)
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
