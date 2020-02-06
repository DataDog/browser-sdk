import { areCookiesAuthorized, cacheCookieAccess, COOKIE_ACCESS_DELAY } from './cookie'
import { Observable } from './observable'
import * as utils from './utils'

export const SESSION_COOKIE_NAME = '_dd'
export const EXPIRATION_DELAY = 15 * utils.ONE_MINUTE

export interface Session<T> {
  renewObservable: Observable<void>

  getId(): string | undefined

  getType(): T | undefined
}

/**
 * Limit access to cookie to avoid performance issues
 */
let registeredActivityListeners: Array<() => void> = []

export function trackActivity(expandOrRenewSession: () => void) {
  const options = { capture: true, passive: true }
  ;['click', 'touchstart', 'keydown', 'scroll'].forEach((event: string) => {
    document.addEventListener(event, expandOrRenewSession, options)
    registeredActivityListeners.push(() => document.removeEventListener(event, expandOrRenewSession, options))
  })
}

export function stopSessionManagement() {
  registeredActivityListeners.forEach((e) => e())
  registeredActivityListeners = []
}

export function startSessionManagement<Type extends string>(
  cookieName: string,
  computeSessionState: (rawType?: string) => { type: Type; isTracked: boolean },
): Session<Type> {
  const sessionId = cacheCookieAccess(SESSION_COOKIE_NAME)
  const sessionType = cacheCookieAccess(cookieName)
  const cookiesAuthorized: boolean = areCookiesAuthorized()
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
      return (cookiesAuthorized) ? sessionId.get() : undefined
    },
    getType() {
      return sessionType.get() as Type | undefined
    },
    renewObservable,
  }
}
