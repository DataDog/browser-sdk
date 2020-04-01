import { cacheCookieAccess, COOKIE_ACCESS_DELAY, CookieCache } from './cookie'
import { Observable } from './observable'
import * as utils from './utils'

export const SESSION_COOKIE_NAME = '_dd'
export const EXPIRATION_DELAY = 15 * utils.ONE_MINUTE

export interface Session<T> {
  renewObservable: Observable<void>
  getId(): string | undefined
  getType(): T | undefined
}

interface SessionState {
  id?: string
  [key: string]: string | undefined
}

/**
 * Limit access to cookie to avoid performance issues
 */
export function startSessionManagement<Type extends string>(
  sessionTypeKey: string,
  computeSessionState: (rawType?: string) => { type: Type; isTracked: boolean }
): Session<Type> {
  const sessionCookie = cacheCookieAccess(SESSION_COOKIE_NAME)
  const renewObservable = new Observable<void>()
  let currentSessionId = retrieveSession(sessionCookie).id

  const expandOrRenewSession = utils.throttle(() => {
    const session = retrieveSession(sessionCookie)
    const { type, isTracked } = computeSessionState(session[sessionTypeKey])
    session[sessionTypeKey] = type
    if (isTracked && !session.id) {
      session.id = utils.generateUUID()
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
      return retrieveSession(sessionCookie).id
    },
    getType() {
      return retrieveSession(sessionCookie)[sessionTypeKey] as Type | undefined
    },
    renewObservable,
  }
}

const SESSION_ENTRY_REGEXP = /^([a-z]+)=([a-z0-9-]+)$/

const SESSION_ENTRY_SEPARATOR = '&'

function isValidSessionString(sessionString: string | undefined): sessionString is string {
  return (
    sessionString !== undefined &&
    (sessionString.indexOf(SESSION_ENTRY_SEPARATOR) !== -1 || SESSION_ENTRY_REGEXP.test(sessionString))
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

function persistSession(session: SessionState, cookie: CookieCache) {
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
  const options = { capture: true, passive: true }
  ;['click', 'touchstart', 'keydown', 'scroll'].forEach((event: string) => {
    document.addEventListener(event, expandOrRenewSession, options)
    registeredActivityListeners.push(() => document.removeEventListener(event, expandOrRenewSession, options))
  })
}
