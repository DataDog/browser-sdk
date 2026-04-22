import { ONE_MINUTE } from '@datadog/core-next'

export interface CookieOptions {
  domain?: string
  secure?: boolean
  partitioned?: boolean
  sameSite?: 'strict' | 'lax' | 'none'
}

// Regex for parsing semicolon-separated key=value cookie strings.
// https://www.ietf.org/rfc/rfc6265.txt
const COOKIE_PAIR = /(\S+?)\s*=\s*([^;]*)(?:;|$)/g

function parseCookies(cookieString: string): Map<string, string> {
  const result = new Map<string, string>()
  COOKIE_PAIR.lastIndex = 0
  while (true) {
    const match = COOKIE_PAIR.exec(cookieString)
    if (!match) {
      break
    }
    if (!result.has(match[1])) {
      result.set(match[1], match[2])
    }
  }
  return result
}

/**
 * Returns the value of the cookie with the given name.
 * If there are multiple cookies with the same name, returns the first one.
 */
export function getCookie(name: string): string | undefined {
  return parseCookies(document.cookie).get(name)
}

/**
 * Writes a cookie with the given name, value, and expiry (in ms from now).
 */
export function setCookie(name: string, value: string, expiresMs: number, options?: CookieOptions): void {
  const date = new Date()
  date.setTime(date.getTime() + expiresMs)
  const expires = `expires=${date.toUTCString()}`
  const sameSite = options?.sameSite ?? 'strict'
  const domain = options?.domain ? `;domain=${options.domain}` : ''
  const secure = options?.secure ? ';secure' : ''
  const partitioned = options?.partitioned ? ';partitioned' : ''
  document.cookie = `${name}=${value};${expires};path=/;samesite=${sameSite}${domain}${secure}${partitioned}`
}

/**
 * Deletes a cookie by setting its expiry to the past.
 * Pass the same options (domain, etc.) used when setting.
 */
export function deleteCookie(name: string, options?: CookieOptions): void {
  setCookie(name, '', -1, options)
}

/**
 * Tests whether cookies can be written and read back.
 */
export function areCookiesAuthorized(): boolean {
  try {
    const testCookieName = 'dd_cookie_test'
    const testCookieValue = 'test'
    setCookie(testCookieName, testCookieValue, ONE_MINUTE)
    const authorized = getCookie(testCookieName) === testCookieValue
    deleteCookie(testCookieName)
    return authorized
  } catch {
    return false
  }
}
