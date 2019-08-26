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
