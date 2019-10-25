import {
  cacheCookieAccess,
  Configuration,
  COOKIE_ACCESS_DELAY,
  CookieCache,
  EXPIRATION_DELAY,
  generateUUID,
  performDraw,
  SESSION_COOKIE_NAME,
  throttle,
  trackActivity,
} from '@browser-agent/core'

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
  return throttle(() => {
    let sessionType = loggerSession.get() as LoggerSessionType | undefined
    if (!hasValidLoggerSession(sessionType)) {
      sessionType = performDraw(configuration.sampleRate) ? LoggerSessionType.TRACKED : LoggerSessionType.NOT_TRACKED
    }
    loggerSession.set(sessionType as string, EXPIRATION_DELAY)
    if (sessionType === LoggerSessionType.TRACKED) {
      sessionId.set(sessionId.get() || generateUUID(), EXPIRATION_DELAY)
    }
  }, COOKIE_ACCESS_DELAY)
}

function hasValidLoggerSession(type?: LoggerSessionType) {
  return type !== undefined && (type === LoggerSessionType.NOT_TRACKED || type === LoggerSessionType.TRACKED)
}
