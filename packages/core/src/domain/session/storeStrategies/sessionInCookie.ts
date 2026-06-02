import { isEmptyObject } from '../../../tools/utils/objectUtils'
import type { CookieOptions } from '../../../browser/cookie'
import { getCookies } from '../../../browser/cookie'
import type { Configuration } from '../../configuration'
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
import { globalObject } from '../../../tools/globalObject'
import { CookieApi, LEGACY_SESSION_STORE_KEY, SESSION_STORE_KEY } from './sessionStoreStrategy'
import type {
  SessionStoreStrategy,
  SessionStoreStrategyType,
  CookieSessionStoreStrategyType,
  SessionStateOperation,
} from './sessionStoreStrategy'

const SESSION_COOKIE_VERSION = 0

export async function selectCookieStrategy(
  configuration: Configuration
): Promise<SessionStoreStrategyType | undefined> {
  const { cookieOptions } = configuration
  if (!cookieOptions) {
    return undefined
  }

  if (
    mockable(globalObject.cookieStore) &&
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
  const sessionObservable = new Observable<SessionState>()
  const trackAnonymousUser = !!configuration.trackAnonymousUser
  const opts = encodeCookieOptions(cookieOptions)
  const cookieAccess = mockable(createCookieAccess)(cookieApi, configuration, cookieOptions)
  let isFirstCall = true

  cookieAccess.observable.subscribe(() => {
    cookieAccess
      .getAll()
      .then((cookieValues) => {
        sessionObservable.notify(findMatchingSessionState(cookieValues, opts))
      })
      .catch((error) => monitorError(new Error(`Error while reading session cookies on change: ${error}`)))
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
    async setSessionState(
      fn: (sessionState: SessionState) => SessionState,
      _operation: SessionStateOperation
    ): Promise<void> {
      if (typeof navigator !== 'undefined' && navigator.locks) {
        await navigator.locks
          .request(SESSION_STORE_KEY, () => applyAndWrite(fn))
          .catch((error: unknown) => {
            if (isContextGoingAwayError(error)) {
              return
            }
            throw error
          })
      } else {
        pendingChain = (pendingChain ?? Promise.resolve()).then(() => applyAndWrite(fn))
        await pendingChain
      }
    },
    sessionObservable,
  }
}

// Thrown when the browsing context tears down mid-lock-request.
//   - "AbortError: Promise was rejected because the browsing context is going away" (Webkit)
//   - "Error: Failed to execute 'request' on 'LockManager': The provided callback is no longer runnable." (Chromium)
function isContextGoingAwayError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  return error.name === 'AbortError' || error.message.includes('no longer runnable')
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
