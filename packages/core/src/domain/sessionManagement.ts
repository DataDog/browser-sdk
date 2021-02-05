import { cacheCookieAccess, COOKIE_ACCESS_DELAY, CookieCache, CookieOptions } from '../browser/cookie'
import { Observable } from '../tools/observable'
import * as utils from '../tools/utils'
import { monitor } from './internalMonitoring'
import { tryOldCookiesMigration } from './oldCookiesMigration'

export const SESSION_COOKIE_NAME = '_dd_s'
export const SESSION_EXPIRATION_DELAY = 15 * utils.ONE_MINUTE
export const SESSION_TIME_OUT_DELAY = 4 * utils.ONE_HOUR
export const VISIBILITY_CHECK_DELAY = utils.ONE_MINUTE

export interface Session<T> {
  renewObservable: Observable<void>
  getId: () => string | undefined
  getTrackingType: () => T | undefined
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
  let currentSessionId = retrieveActiveSession(sessionCookie).id

  const { throttled: expandOrRenewSession } = utils.throttle(
    monitor(() => {
      const session = retrieveActiveSession(sessionCookie)
      const { trackingType, isTracked } = computeSessionState(session[productKey])
      session[productKey] = trackingType
      if (isTracked && !session.id) {
        session.id = utils.generateUUID()
        session.created = String(Date.now())
      }
      // save changes and expand session duration
      persistSession(session, sessionCookie)

      // If the session id has changed, notify that the session has been renewed
      if (isTracked && currentSessionId !== session.id) {
        currentSessionId = session.id
        renewObservable.notify()
      }
    }),
    COOKIE_ACCESS_DELAY
  )

  const expandSession = () => {
    const session = retrieveActiveSession(sessionCookie)
    persistSession(session, sessionCookie)
  }

  expandOrRenewSession()
  trackActivity(expandOrRenewSession)
  trackVisibility(expandSession)

  return {
    getId: () => retrieveActiveSession(sessionCookie).id,
    getTrackingType: () => retrieveActiveSession(sessionCookie)[productKey] as TrackingType | undefined,
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
