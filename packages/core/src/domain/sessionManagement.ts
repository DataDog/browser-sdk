import { cacheCookieAccess, COOKIE_ACCESS_DELAY, CookieCache, CookieOptions, getCookie } from '../browser/cookie'
import { Observable } from '../tools/observable'
import * as utils from '../tools/utils'
import { timeStampNow } from '../tools/timeUtils'
import { monitor, addMonitoringMessage } from './internalMonitoring'
import { tryOldCookiesMigration } from './oldCookiesMigration'

export const SESSION_COOKIE_NAME = '_dd_s'
export const SESSION_EXPIRATION_DELAY = 15 * utils.ONE_MINUTE
export const SESSION_TIME_OUT_DELAY = 4 * utils.ONE_HOUR
export const VISIBILITY_CHECK_DELAY = utils.ONE_MINUTE

export interface Session<T> {
  renewObservable: Observable<void>
  getId: () => string | undefined
  getTrackingType: () => T | undefined
  getInMemoryTrackingType: () => T | undefined
}

export interface SessionState {
  id?: string
  created?: string
  expire?: string
  [key: string]: string | undefined
}

/**
 * Limit access to cookie to avoid performance issues
 */
export function startSessionManagement<TrackingType extends string>(
  options: CookieOptions,
  productKey: string,
  computeSessionState: (rawTrackingType?: string) => { trackingType: TrackingType; isTracked: boolean }
): Session<TrackingType> {
  const sessionCookie = cacheCookieAccess(SESSION_COOKIE_NAME, options)
  tryOldCookiesMigration(sessionCookie)
  const renewObservable = new Observable<void>()
  let inMemorySession = retrieveActiveSession(sessionCookie)

  const { throttled: expandOrRenewSession } = utils.throttle(
    monitor(() => {
      sessionCookie.clearCache()
      const cookieSession = retrieveActiveSession(sessionCookie)
      const retrievedSession = { ...cookieSession }
      const { trackingType, isTracked } = computeSessionState(cookieSession[productKey])
      cookieSession[productKey] = trackingType
      if (isTracked && !cookieSession.id) {
        cookieSession.id = utils.generateUUID()
        cookieSession.created = String(Date.now())
      }
      // save changes and expand session duration
      persistSession(cookieSession, sessionCookie)

      // If the session id has changed, notify that the session has been renewed
      if (isTracked && inMemorySession.id !== cookieSession.id) {
        inMemorySession = { ...cookieSession }
        renewObservable.notify()
      }
      if (isTracked && inMemorySession[productKey] !== undefined && inMemorySession[productKey] !== trackingType) {
        addMonitoringMessage('session type changed - eors', {
          debug: {
            product: productKey,
            inMemorySession,
            retrievedSession,
            newTrackingType: trackingType,
            _dd_s: getCookie(SESSION_COOKIE_NAME),
          },
        })
      }
      inMemorySession = { ...cookieSession }
    }),
    COOKIE_ACCESS_DELAY
  )

  const expandSession = () => {
    sessionCookie.clearCache()
    const session = retrieveActiveSession(sessionCookie)
    persistSession(session, sessionCookie)
    if (session.id === inMemorySession.id && session[productKey] !== inMemorySession[productKey]) {
      addMonitoringMessage('session type changed - es', {
        debug: {
          product: productKey,
          inMemorySession,
          retrievedSession: session,
          newTrackingType: session[productKey],
          _dd_s: getCookie(SESSION_COOKIE_NAME),
        },
      })
      inMemorySession = { ...session }
    }
  }

  expandOrRenewSession()
  trackActivity(expandOrRenewSession)
  trackVisibility(expandSession)
  checkCookieConsistency()

  function checkCookieConsistency() {
    const alternateSessionCookie = cacheCookieAccess(SESSION_COOKIE_NAME, options)
    const initTime = timeStampNow()
    setTimeout(() => {
      const sessionCookieCheck = retrieveActiveSession(alternateSessionCookie)
      alternateSessionCookie.clearCache()
      const checkDelay = timeStampNow() - initTime
      if (
        (sessionCookieCheck.id !== inMemorySession.id ||
          sessionCookieCheck[productKey] !== inMemorySession[productKey]) &&
        checkDelay < COOKIE_ACCESS_DELAY
      ) {
        addMonitoringMessage('cookie corrupted', {
          debug: {
            initTime,
            checkDelay,
            createdDelay: Number(sessionCookieCheck.created!) - Number(inMemorySession.created!),
            expireDelay: Number(sessionCookieCheck.expire!) - Number(inMemorySession.expire!),
            productKey,
            sessionCookieCheck,
            inMemorySession,
            _dd_s: getCookie(SESSION_COOKIE_NAME),
          },
        })
      }
    })
    const cookieConsistencyCheckInterval = setInterval(() => {
      const sessionCookieCheck = retrieveActiveSession(alternateSessionCookie)
      alternateSessionCookie.clearCache()
      if (
        inMemorySession.id === sessionCookieCheck.id &&
        inMemorySession[productKey] !== sessionCookieCheck[productKey]
      ) {
        addMonitoringMessage('session type changed - ccc', {
          debug: {
            product: productKey,
            inMemorySession,
            retrievedSession: sessionCookieCheck,
            newTrackingType: sessionCookieCheck[productKey],
            _dd_s: getCookie(SESSION_COOKIE_NAME),
          },
        })
        inMemorySession = { ...sessionCookieCheck }
      }
    }, COOKIE_ACCESS_DELAY)
    stopCallbacks.push(() => clearInterval(cookieConsistencyCheckInterval))
  }

  return {
    getId: () => retrieveActiveSession(sessionCookie).id,
    getTrackingType: () => retrieveActiveSession(sessionCookie)[productKey] as TrackingType | undefined,
    getInMemoryTrackingType: () => inMemorySession[productKey] as TrackingType | undefined,
    renewObservable,
  }
}

const SESSION_ENTRY_REGEXP = /^([a-z]+)=([a-z0-9-]+)$/

const SESSION_ENTRY_SEPARATOR = '&'

export function isValidSessionString(sessionString: string | undefined): sessionString is string {
  return (
    sessionString !== undefined &&
    (sessionString.indexOf(SESSION_ENTRY_SEPARATOR) !== -1 || SESSION_ENTRY_REGEXP.test(sessionString))
  )
}

function retrieveActiveSession(sessionCookie: CookieCache): SessionState {
  const session = retrieveSession(sessionCookie)
  if (isActiveSession(session)) {
    return session
  }
  clearSession(sessionCookie)
  return {}
}

function isActiveSession(session: SessionState) {
  // created and expire can be undefined for versions which was not storing them
  // these checks could be removed when older versions will not be available/live anymore
  return (
    (session.created === undefined || Date.now() - Number(session.created) < SESSION_TIME_OUT_DELAY) &&
    (session.expire === undefined || Date.now() < Number(session.expire))
  )
}

function retrieveSession(sessionCookie: CookieCache): SessionState {
  const sessionString = sessionCookie.get()
  const session: SessionState = {}
  if (isValidSessionString(sessionString)) {
    sessionString.split(SESSION_ENTRY_SEPARATOR).forEach((entry) => {
      const matches = SESSION_ENTRY_REGEXP.exec(entry)
      if (matches !== null) {
        const [, key, value] = matches
        session[key] = value
      }
    })
  }
  return session
}

export function persistSession(session: SessionState, cookie: CookieCache) {
  if (utils.isEmptyObject(session)) {
    clearSession(cookie)
    return
  }
  session.expire = String(Date.now() + SESSION_EXPIRATION_DELAY)
  const cookieString = utils
    .objectEntries(session)
    .map(([key, value]) => `${key}=${value as string}`)
    .join(SESSION_ENTRY_SEPARATOR)
  cookie.set(cookieString, SESSION_EXPIRATION_DELAY)
}

function clearSession(cookie: CookieCache) {
  cookie.set('', 0)
}

export function stopSessionManagement() {
  stopCallbacks.forEach((e) => e())
  stopCallbacks = []
}

let stopCallbacks: Array<() => void> = []

export function trackActivity(expandOrRenewSession: () => void) {
  const { stop } = utils.addEventListeners(
    window,
    [utils.DOM_EVENT.CLICK, utils.DOM_EVENT.TOUCH_START, utils.DOM_EVENT.KEY_DOWN, utils.DOM_EVENT.SCROLL],
    expandOrRenewSession,
    { capture: true, passive: true }
  )
  stopCallbacks.push(stop)
}

function trackVisibility(expandSession: () => void) {
  const expandSessionWhenVisible = monitor(() => {
    if (document.visibilityState === 'visible') {
      expandSession()
    }
  })

  const { stop } = utils.addEventListener(document, utils.DOM_EVENT.VISIBILITY_CHANGE, expandSessionWhenVisible)
  stopCallbacks.push(stop)

  const visibilityCheckInterval = setInterval(expandSessionWhenVisible, VISIBILITY_CHECK_DELAY)
  stopCallbacks.push(() => {
    clearInterval(visibilityCheckInterval)
  })
}
