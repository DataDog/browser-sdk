import { cacheCookieAccess, COOKIE_ACCESS_DELAY, CookieCache } from './cookie'
import { monitor } from './internalMonitoring'
import { Observable } from './observable'
import { tryOldCookiesMigration } from './oldCookiesMigration'
import * as utils from './utils'

export const SESSION_COOKIE_NAME = '_dd_s'
export const EXPIRATION_DELAY = 15 * utils.ONE_MINUTE
export const SESSION_TIME_OUT_DELAY = 4 * utils.ONE_HOUR

export interface Session<T> {
  renewObservable: Observable<void>
  getId(): string | undefined
  getType(): T | undefined
}

export interface SessionState {
  id?: string
  created?: string
  [key: string]: string | undefined
}

/**
 * Limit access to cookie to avoid performance issues
 */
export function startSessionManagement<Type extends string>(
  sessionTypeKey: string,
  computeSessionState: (rawType?: string) => { type: Type; isTracked: boolean },
  withNewSessionStrategy = false
): Session<Type> {
  const sessionCookie = cacheCookieAccess(SESSION_COOKIE_NAME)
  tryOldCookiesMigration(sessionCookie)
  const renewObservable = new Observable<void>()
  let currentSessionId = retrieveActiveSession(sessionCookie, withNewSessionStrategy).id

  const expandOrRenewSession = utils.throttle(() => {
    const session = retrieveActiveSession(sessionCookie, withNewSessionStrategy)
    const { type, isTracked } = computeSessionState(session[sessionTypeKey])
    session[sessionTypeKey] = type
    if (isTracked && !session.id) {
      session.id = utils.generateUUID()
      if (withNewSessionStrategy) {
        session.created = String(Date.now())
      }
    }
    // save changes and expand session duration
    persistSession(session, sessionCookie)

    // If the session id has changed, notify that the session has been renewed
    if (isTracked && currentSessionId !== session.id) {
      currentSessionId = session.id
      renewObservable.notify()
    }
  }, COOKIE_ACCESS_DELAY)

  expandOrRenewSession()
  trackActivity(expandOrRenewSession)

  return {
    getId() {
      return retrieveActiveSession(sessionCookie, withNewSessionStrategy).id
    },
    getType() {
      return retrieveActiveSession(sessionCookie, withNewSessionStrategy)[sessionTypeKey] as Type | undefined
    },
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

function retrieveActiveSession(sessionCookie: CookieCache, withNewSessionStrategy: boolean): SessionState {
  const session = retrieveSession(sessionCookie)
  if (!withNewSessionStrategy || isActiveSession(session)) {
    return session
  }
  const timedOutSession = {}
  persistSession(timedOutSession, sessionCookie)
  return timedOutSession
}

function isActiveSession(session: SessionState) {
  // created can be undefined for versions which was not storing created date
  // this check could be removed when older versions will not be available/live anymore
  return session.created === undefined || Date.now() - Number(session.created) < SESSION_TIME_OUT_DELAY
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
  const cookieString = utils
    .objectEntries(session)
    .map(([key, value]) => `${key}=${value}`)
    .join(SESSION_ENTRY_SEPARATOR)
  cookie.set(cookieString, EXPIRATION_DELAY)
}

export function stopSessionManagement() {
  registeredActivityListeners.forEach((e) => e())
  registeredActivityListeners = []
}

let registeredActivityListeners: Array<() => void> = []

export function trackActivity(expandOrRenewSession: () => void) {
  const doExpandOrRenewSession = monitor(expandOrRenewSession)
  const options = { capture: true, passive: true }
  ;['click', 'touchstart', 'keydown', 'scroll'].forEach((event: string) => {
    document.addEventListener(event, doExpandOrRenewSession, options)
    registeredActivityListeners.push(() => document.removeEventListener(event, doExpandOrRenewSession, options))
  })
}
