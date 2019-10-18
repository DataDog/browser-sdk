import { Configuration } from '@browser-agent/core/src/configuration'
import {
  cacheCookieAccess,
  COOKIE_ACCESS_DELAY,
  CookieCache,
  EXPIRATION_DELAY,
  SESSION_COOKIE_NAME,
  trackActivity,
} from '@browser-agent/core/src/session'
import * as utils from '@browser-agent/core/src/utils'

export const LOGGER_COOKIE_NAME = '_dd_l'

export interface LoggerSession {
  getId: () => string | undefined
  isTracked: () => boolean
}

export enum LoggerSessionType {
  NOT_TRACKED = '0',
  TRACKED = '1',
}

export function startLoggerSession(configuration: Configuration): LoggerSession {
  const loggerSession = cacheCookieAccess(LOGGER_COOKIE_NAME)
  const sessionId = cacheCookieAccess(SESSION_COOKIE_NAME)

  const expandOrRenewSession = makeExpandOrRenewSession(configuration, loggerSession, sessionId)

  expandOrRenewSession()
  trackActivity(expandOrRenewSession)

  return {
    getId: () => sessionId.get(),
    isTracked: () => loggerSession.get() === LoggerSessionType.TRACKED,
  }
}

function makeExpandOrRenewSession(configuration: Configuration, loggerSession: CookieCache, sessionId: CookieCache) {
  return utils.throttle(() => {
    let sessionType = loggerSession.get() as LoggerSessionType | undefined
    if (!hasValidLoggerSession(sessionType)) {
      sessionType = utils.performDraw(configuration.sampleRate)
        ? LoggerSessionType.TRACKED
        : LoggerSessionType.NOT_TRACKED
    }
    loggerSession.set(sessionType as string, EXPIRATION_DELAY)
    if (sessionType === LoggerSessionType.TRACKED) {
      sessionId.set(sessionId.get() || utils.generateUUID(), EXPIRATION_DELAY)
    }
  }, COOKIE_ACCESS_DELAY)
}

function hasValidLoggerSession(type?: LoggerSessionType) {
  return type !== undefined && (type === LoggerSessionType.NOT_TRACKED || type === LoggerSessionType.TRACKED)
}
