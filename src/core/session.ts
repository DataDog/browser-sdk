import { cache, throttle } from './util'

export const COOKIE_NAME = '_dd'
const EXPIRATION_DELAY = 15 * 60 * 1000

/**
 * Limit access to cookie to avoid performance issues
 */
export const COOKIE_ACCESS_DELAY = 1000

export function initSession() {
  expandOrRenewSession()
  trackActivity()
}

export const getSessionId = cache(() => getCookie(COOKIE_NAME), COOKIE_ACCESS_DELAY)

const expandOrRenewSession = throttle(() => {
  const sessionId = getSessionId()
  setCookie(COOKIE_NAME, sessionId !== undefined ? sessionId : generateUUID(), EXPIRATION_DELAY)
}, COOKIE_ACCESS_DELAY)

function trackActivity() {
  const options = { capture: true, passive: true }
  ;['click', 'touchstart', 'keydown', 'scroll'].forEach((event: string) =>
    document.addEventListener(event, expandOrRenewSession, options)
  )
}

/**
 * UUID v4
 * from https://gist.github.com/jed/982883
 */
function generateUUID(placeholder?: any): string {
  return placeholder
    ? // tslint:disable-next-line no-bitwise
      (placeholder ^ ((Math.random() * 16) >> (placeholder / 4))).toString(16)
    : `${1e7}-${1e3}-${4e3}-${8e3}-${1e11}`.replace(/[018]/g, generateUUID)
}

export function setCookie(name: string, value: any, expireDelay: number) {
  const date = new Date()
  date.setTime(date.getTime() + expireDelay)
  const expires = `expires=${date.toUTCString()}`
  document.cookie = `${name}=${value};${expires};path=/`
}

export function getCookie(name: string) {
  const matches = document.cookie.match(`(^|;)\\s*${name}\\s*=\\s*([^;]+)`)
  return matches ? matches.pop() : undefined
}
