import { display } from '../tools/display'
import { findCommaSeparatedValue, generateUUID, ONE_SECOND } from '../tools/utils'

export const COOKIE_ACCESS_DELAY = ONE_SECOND

export interface CookieOptions {
  secure?: boolean
  crossSite?: boolean
  domain?: string
}

export interface CookieCache {
  get: () => string | undefined
  set: (value: string, expireDelay: number) => void
}

export function cacheCookieAccess(name: string, options: CookieOptions): CookieCache {
  let timeout: number
  let cache: string | undefined
  let hasCache = false

  const cacheAccess = () => {
    hasCache = true
    clearTimeout(timeout)
    timeout = setTimeout(() => {
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
      setCookie(name, value, expireDelay, options)
      cache = value
      cacheAccess()
    },
  }
}

export function setCookie(name: string, value: string, expireDelay: number, options?: CookieOptions) {
  const date = new Date()
  date.setTime(date.getTime() + expireDelay)
  const expires = `expires=${date.toUTCString()}`
  const sameSite = options && options.crossSite ? 'none' : 'strict'
  const domain = options && options.domain ? `;domain=${options.domain}` : ''
  const secure = options && options.secure ? `;secure` : ''
  document.cookie = `${name}=${value};${expires};path=/;samesite=${sameSite}${domain}${secure}`
}

export function getCookie(name: string) {
  return findCommaSeparatedValue(document.cookie, name)
}

export function areCookiesAuthorized(options: CookieOptions): boolean {
  if (document.cookie === undefined || document.cookie === null) {
    return false
  }
  try {
    // Use a unique cookie name to avoid issues when the SDK is initialized multiple times during
    // the test cookie lifetime
    const testCookieName = `dd_cookie_test_${generateUUID()}`
    const testCookieValue = 'test'
    setCookie(testCookieName, testCookieValue, ONE_SECOND, options)
    return getCookie(testCookieName) === testCookieValue
  } catch (error) {
    display.error(error)
    return false
  }
}

/**
 * No API to retrieve it, number of levels for subdomain and suffix are unknown
 * strategy: find the minimal domain on which cookies are allowed to be set
 * https://web.dev/same-site-same-origin/#site
 */
let getCurrentSiteCache: string | undefined
export function getCurrentSite() {
  if (getCurrentSiteCache === undefined) {
    // Use a unique cookie name to avoid issues when the SDK is initialized multiple times during
    // the test cookie lifetime
    const testCookieName = `dd_site_test_${generateUUID()}`
    const testCookieValue = 'test'

    const domainLevels = window.location.hostname.split('.')
    let candidateDomain = domainLevels.pop()!
    while (domainLevels.length && !getCookie(testCookieName)) {
      candidateDomain = `${domainLevels.pop()!}.${candidateDomain}`
      setCookie(testCookieName, testCookieValue, ONE_SECOND, { domain: candidateDomain })
    }
    getCurrentSiteCache = candidateDomain
  }
  return getCurrentSiteCache
}
