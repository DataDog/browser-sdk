import { Observable } from './observable'
import * as utils from './utils'

export const SESSION_COOKIE_NAME = '_dd'
export const EXPIRATION_DELAY = 15 * utils.ONE_MINUTE

/**
 * Limit access to cookie to avoid performance issues
 */
export const COOKIE_ACCESS_DELAY = 1000
let registeredActivityListeners: Array<() => void> = []

export function trackActivity(expandOrRenewSession: () => void) {
  const options = { capture: true, passive: true }
  ;['click', 'touchstart', 'keydown', 'scroll'].forEach((event: string) => {
    document.addEventListener(event, expandOrRenewSession, options)
    registeredActivityListeners.push(() => document.removeEventListener(event, expandOrRenewSession, options))
  })
}

export function cleanupActivityTracking() {
  registeredActivityListeners.forEach((e) => e())
  registeredActivityListeners = []
}

export interface CookieCache {
  get: () => string | undefined
  set: (value: string, expireDelay: number) => void
}

export function cacheCookieAccess(name: string): CookieCache {
  let timeout: number
  let cache: string | undefined
  let hasCache = false

  const cacheAccess = () => {
    hasCache = true
    window.clearTimeout(timeout)
    timeout = window.setTimeout(() => {
      hasCache = false
    }, COOKIE_ACCESS_DELAY)
  }

  return {
    get: () => {
      if (hasCache) {
        return cache
      }
      cache = getCookie(name)
      cacheAccess()
      return cache
    },
    set: (value: string, expireDelay: number) => {
      setCookie(name, value, expireDelay)
      cache = value
      cacheAccess()
    },
  }
}

export function setCookie(name: string, value: string, expireDelay: number) {
  const date = new Date()
  date.setTime(date.getTime() + expireDelay)
  const expires = `expires=${date.toUTCString()}`
  document.cookie = `${name}=${value};${expires};path=/`
}

export function getCookie(name: string) {
  const matches = document.cookie.match(`(^|;)\\s*${name}\\s*=\\s*([^;]+)`)
  return matches ? matches.pop() : undefined
}

export function initSession<Type extends string>(
  cookieName: string,
  getTypeInfo: (rawType?: string) => { type: Type; isTracked: boolean }
) {
  const sessionId = cacheCookieAccess(SESSION_COOKIE_NAME)
  const sessionType = cacheCookieAccess(cookieName)
  const renewObservable = new Observable<undefined>()
  let currentSessionId = sessionId.get()

  const expandOrRenewSession = utils.throttle(() => {
    const { type, isTracked } = getTypeInfo(sessionType.get() as Type | undefined)
    sessionType.set(type, EXPIRATION_DELAY)
    if (isTracked) {
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
        renewObservable.notify(undefined)
      }
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
