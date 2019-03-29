import * as utils from './utils'

export const COOKIE_NAME = '_dd'
const EXPIRATION_DELAY = 15 * 60 * 1000

/**
 * Limit access to cookie to avoid performance issues
 */
export const COOKIE_ACCESS_DELAY = 1000

export function startSessionTracking() {
  expandOrRenewSession()
  trackActivity()
}

export const getSessionId = utils.cache(() => getCookie(COOKIE_NAME), COOKIE_ACCESS_DELAY)

const expandOrRenewSession = utils.throttle(() => {
  const sessionId = getSessionId()
  setCookie(COOKIE_NAME, sessionId || utils.generateUUID(), EXPIRATION_DELAY)
}, COOKIE_ACCESS_DELAY)

function trackActivity() {
  const options = { capture: true, passive: true }
  ;['click', 'touchstart', 'keydown', 'scroll'].forEach((event: string) =>
    document.addEventListener(event, expandOrRenewSession, options)
  )
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
