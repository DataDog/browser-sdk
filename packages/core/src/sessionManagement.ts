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
  cookieName: string,
  computeSessionState: (rawType?: string) => { type: Type; isTracked: boolean }
): Session<Type> {
  const sessionId = cacheCookieAccess(SESSION_COOKIE_NAME)
  const sessionType = cacheCookieAccess(cookieName)
  const renewObservable = new Observable<void>()
  let currentSessionId = sessionId.get()

  const expandOrRenewSession = utils.throttle(() => {
    const { type, isTracked } = computeSessionState(sessionType.get())
    sessionType.set(type, EXPIRATION_DELAY)
    if (!isTracked) {
      return
    }

    if (sessionId.get()) {
      // If we already have a session id, just expand its duration
      sessionId.set(sessionId.get()!, EXPIRATION_DELAY)
    } else {
      // Else generate a new session id
      sessionId.set(utils.generateUUID(), EXPIRATION_DELAY)
    }

    // If the session id has changed, notify that the session has been renewed
    if (currentSessionId !== sessionId.get()) {
      currentSessionId = sessionId.get()
      renewObservable.notify()
    }
  }, COOKIE_ACCESS_DELAY)

  expandOrRenewSession()
  trackActivity(expandOrRenewSession)

  return {
    getId() {
      return sessionId.get()
    },
    getType() {
      return sessionType.get() as Type | undefined
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
