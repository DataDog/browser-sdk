import { Configuration } from '../core/configuration'
import {
  cacheCookieAccess,
  COOKIE_ACCESS_DELAY,
  CookieCache,
  EXPIRATION_DELAY,
  SESSION_COOKIE_NAME,
  trackActivity,
} from '../core/session'
import * as utils from '../core/utils'

export const RUM_COOKIE_NAME = '_dd_r'

export interface RumSession {
  getId: () => string | undefined
  isTracked: () => boolean
}

export enum RumSessionType {
  NOT_TRACKED = '0',
  TRACKED = '1',
}

export function startRumSession(configuration: Configuration): RumSession {
  const rumSession = cacheCookieAccess(RUM_COOKIE_NAME)
  const sessionId = cacheCookieAccess(SESSION_COOKIE_NAME)

  const expandOrRenewSession = makeExpandOrRenewSession(configuration, rumSession, sessionId)

  expandOrRenewSession()
  trackActivity(expandOrRenewSession)

  return {
    getId: () => sessionId.get(),
    isTracked: () => rumSession.get() === RumSessionType.TRACKED,
  }
}

function makeExpandOrRenewSession(configuration: Configuration, loggerSession: CookieCache, sessionId: CookieCache) {
  return utils.throttle(() => {
    let sessionType = loggerSession.get() as RumSessionType | undefined
    if (!hasValidRumSession(sessionType)) {
      sessionType = utils.performDraw(configuration.sampleRate) ? RumSessionType.TRACKED : RumSessionType.NOT_TRACKED
    }
    loggerSession.set(sessionType as string, EXPIRATION_DELAY)
    if (sessionType === RumSessionType.TRACKED) {
      sessionId.set(sessionId.get() || utils.generateUUID(), EXPIRATION_DELAY)
    }
  }, COOKIE_ACCESS_DELAY)
}

function hasValidRumSession(type?: RumSessionType) {
  return type !== undefined && (type === RumSessionType.NOT_TRACKED || type === RumSessionType.TRACKED)
}
