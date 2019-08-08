import {
  COOKIE_ACCESS_DELAY,
  EXPIRATION_DELAY,
  getCookie,
  SESSION_COOKIE_NAME,
  setCookie,
  trackActivity,
} from '../core/session'
import * as utils from '../core/utils'

export interface RumSession {
  getId: () => string | undefined
}

export function startRumSession() {
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
