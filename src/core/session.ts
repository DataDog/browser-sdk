import * as utils from './utils'

export const SESSION_COOKIE_NAME = '_dd'
export const EXPIRATION_DELAY = 15 * utils.ONE_MINUTE

/**
 * Limit access to cookie to avoid performance issues
 */
export const COOKIE_ACCESS_DELAY = 1000

export interface Session {
  getId: () => string | undefined
}

// TODO: move to RUM in next PR
export function startSessionTracking(): Session {
  const getSessionId = utils.cache(() => getCookie(SESSION_COOKIE_NAME), COOKIE_ACCESS_DELAY)
  const expandOrRenewSession = makeExpandOrRenewSession(getSessionId)

  expandOrRenewSession()
  trackActivity(expandOrRenewSession)

  return {
    getId: getSessionId,
  }
}

function makeExpandOrRenewSession(getSessionId: () => string | undefined) {
  return utils.throttle(() => {
    const sessionId = getSessionId()
    setCookie(SESSION_COOKIE_NAME, sessionId || utils.generateUUID(), EXPIRATION_DELAY)
  }, COOKIE_ACCESS_DELAY)
}

export function trackActivity(expandOrRenewSession: () => void) {
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
