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
import { noop } from '../../../tools/utils/functionUtils'
import type { CookieAccess } from '../../../browser/cookieAccess'
import {
  areCookiesAuthorized,
  createCookieStoreAccess,
  createDocumentCookieAccess,
} from '../../../browser/cookieAccess'
import { timeStampNow, dateNow } from '../../../tools/utils/timeUtils'
import { addTelemetryError } from '../../telemetry'
import type { CookieStoreWindow } from '../../../browser/browser.types'
import { addEventListener, DOM_EVENT } from '../../../browser/addEventListener'
import { getLifecycleContext } from '../../../browser/lifecycleTracker'
import { clearTimeout, setTimeout } from '../../../tools/timer'
import type { Context } from '../../../tools/serialisation/context'
import { CookieApi, LEGACY_SESSION_STORE_KEY, SESSION_STORE_KEY } from './sessionStoreStrategy'
import type {
  SessionStoreStrategy,
  SessionStoreStrategyType,
  SessionObservableEvent,
  CookieSessionStoreStrategyType,
  SessionStateOperation,
} from './sessionStoreStrategy'

const SESSION_COOKIE_VERSION = 0
const LOCK_QUERY_TIMEOUT = 1000

export async function selectCookieStrategy(
  configuration: Configuration
): Promise<SessionStoreStrategyType | undefined> {
  const { cookieOptions } = configuration
  if (!cookieOptions) {
    return undefined
  }

  if (
    canUseCookieStoreStrategy(configuration) &&
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
  const initTimestamp = timeStampNow()

  cookieAccess.observable.subscribe(() => {
    cookieAccess
      .getAll()
      .then((cookieValues) => {
        sessionObservable.notify({ cookieValues, sessionState: findMatchingSessionState(cookieValues, opts) })
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
      operation: SessionStateOperation
    ): Promise<void> {
      if (typeof navigator !== 'undefined' && navigator.locks) {
        const lockRequestedAt = dateNow()
        await navigator.locks
          .request(SESSION_STORE_KEY, () => applyAndWrite(fn))
          .catch(async (error) => {
            const context = await buildLockErrorContext(operation, initTimestamp, lockRequestedAt)
            addTelemetryError(error, context)
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

function canUseCookieStoreStrategy(configuration: Configuration): boolean {
  const cookieStore = mockable((window as CookieStoreWindow).cookieStore)
  if (!cookieStore) {
    return false
  }
  try {
    const { stop } = addEventListener(configuration, cookieStore, DOM_EVENT.CHANGE, noop)
    stop()
    return true
  } catch {
    return false
  }
}

interface LockQuerySnapshot {
  heldByOthers: number
  pendingCount: number
  isPending: boolean
}

async function queryLockSnapshot(): Promise<LockQuerySnapshot | 'timeout' | 'unavailable' | 'error'> {
  if (typeof navigator === 'undefined' || !navigator.locks?.query) {
    return 'unavailable'
  }
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timeoutId = setTimeout(() => resolve('timeout'), LOCK_QUERY_TIMEOUT)
  })
  try {
    const snapshot = await Promise.race([navigator.locks.query(), timeout])
    if (snapshot === 'timeout') {
      return 'timeout'
    }
    const held = snapshot.held ?? []
    const pending = snapshot.pending ?? []
    return {
      heldByOthers: held.filter((lock) => lock.name === SESSION_STORE_KEY).length,
      pendingCount: pending.filter((lock) => lock.name === SESSION_STORE_KEY).length,
      isPending: pending.some((lock) => lock.name === SESSION_STORE_KEY),
    }
  } catch {
    return 'error'
  } finally {
    clearTimeout(timeoutId)
  }
}

function getNavigationType(): string | undefined {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return undefined
  }
  // The document-load entry is what we want here ('back_forward' signals bfcache restore).
  // Some Chromium builds expose extra entries for experimental soft navigations — index 0 is
  // still the original document-load entry per the Performance Timeline ordering.
  const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  return entry?.type
}

function isInIframe(): boolean | undefined {
  try {
    return window !== window.top
  } catch {
    // Cross-origin access — definitely in an iframe
    return true
  }
}

async function buildLockErrorContext(
  operation: SessionStateOperation,
  initTimestamp: number,
  lockRequestedAt: number
): Promise<Context> {
  return {
    operation,
    timeSinceInit: dateNow() - initTimestamp,
    lockRequestDuration: dateNow() - lockRequestedAt,
    visibilityState: document.visibilityState,
    readyState: document.readyState,
    inIframe: isInIframe(),
    navigationType: getNavigationType(),
    sessionCookies: getCookies(SESSION_STORE_KEY),
    lockQuery: (await queryLockSnapshot()) as Context[string],
    ...getLifecycleContext(),
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
