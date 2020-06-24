export const COOKIE_ACCESS_DELAY = 1000

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
  document.cookie = `${name}=${value};${expires};path=/;samesite=strict`
}

export function getCookie(name: string) {
  const matches = document.cookie.match(`(^|;)\\s*${name}\\s*=\\s*([^;]+)`)
  return matches ? matches.pop() : undefined
}

export function areCookiesAuthorized(): boolean {
  if (document.cookie === undefined || document.cookie === null) {
    return false
  }
  try {
    const testCookieName = 'dd_rum_test'
    const testCookieValue = 'test'
    setCookie(testCookieName, testCookieValue, 1000)
    return getCookie(testCookieName) === testCookieValue
  } catch (error) {
    console.error(error)
    return false
  }
}
